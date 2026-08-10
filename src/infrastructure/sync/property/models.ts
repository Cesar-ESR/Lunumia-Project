import type {
  Expense,
  RecurringPaymentOccurrence,
  SyncCursor,
  SyncOperation,
} from '@domain/entities'
import type { SynchronizableRecord } from '@application/services/SyncCoordinator'
import { compareCursorRows, type CursorRow } from './arbitraries'

export function sortQueue(
  operations: readonly SyncOperation[],
): SyncOperation[] {
  return [...operations].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.operationId.localeCompare(right.operationId),
  )
}

export function pageAfter(
  rows: readonly CursorRow[],
  cursor: SyncCursor,
  limit: number,
): CursorRow[] {
  return [...rows]
    .sort(compareCursorRows)
    .filter((row) => {
      if (cursor.lastUpdatedAt === null) return true
      const timestamp = row.updatedAt.localeCompare(cursor.lastUpdatedAt)
      return (
        timestamp > 0 ||
        (timestamp === 0 && row.id > (cursor.lastEntityId ?? ''))
      )
    })
    .slice(0, limit)
}

export function maxCursor(left: SyncCursor, right: SyncCursor): SyncCursor {
  if (left.lastUpdatedAt === null) return right
  if (right.lastUpdatedAt === null) return left
  const timestamp = left.lastUpdatedAt.localeCompare(right.lastUpdatedAt)
  if (timestamp > 0) return left
  if (timestamp < 0) return right
  return (left.lastEntityId ?? '') >= (right.lastEntityId ?? '') ? left : right
}

export function referenceWinner(
  local: SynchronizableRecord,
  remote: SynchronizableRecord,
): 'local' | 'remote' | 'equal' {
  const timestamp = local.updatedAt.localeCompare(remote.updatedAt)
  if (timestamp > 0) return 'local'
  if (timestamp < 0) return 'remote'
  if (local.id > remote.id) return 'local'
  if (local.id < remote.id) return 'remote'
  return 'equal'
}

export function referenceBackoff(
  retryCount: number,
  baseDelayMs: number,
  maxDelayMs: number,
  multiplier: number,
  jitterRatio: number,
  random: number,
): number {
  const exponent = Math.max(0, retryCount - 1)
  const base = Math.min(baseDelayMs * multiplier ** exponent, maxDelayMs)
  const jitter = base * jitterRatio * (random * 2 - 1)
  return Math.max(0, Math.min(maxDelayMs, Math.round(base + jitter)))
}

export class IdempotentRemoteModel {
  private readonly processed = new Set<string>()
  private readonly records = new Map<string, SynchronizableRecord>()

  apply(
    operation: SyncOperation,
    payload: SynchronizableRecord,
  ): 'applied' | 'already_processed' {
    if (this.processed.has(operation.operationId)) return 'already_processed'
    if (
      payload.id !== operation.entityId ||
      payload.ownerId !== operation.ownerId
    ) {
      throw new Error('El payload no coincide con la operación.')
    }
    const current = this.records.get(payload.id)
    if (!current || referenceWinner(current, payload) !== 'local') {
      this.records.set(payload.id, payload)
    }
    this.processed.add(operation.operationId)
    return 'applied'
  }

  get processedCount(): number {
    return this.processed.size
  }

  get size(): number {
    return this.records.size
  }

  get(id: string): SynchronizableRecord | undefined {
    return this.records.get(id)
  }
}

export interface CompoundPaymentPayload {
  occurrence: RecurringPaymentOccurrence
  expense: Expense
}

export type CompoundPaymentResult =
  'applied' | 'already_processed' | 'remote_wins'

/** Modelo transaccional mínimo de apply_sync_operation para pagos compuestos. */
export class CompoundPaymentRemoteModel {
  private processed = new Map<string, string>()
  private occurrences = new Map<string, RecurringPaymentOccurrence>()
  private expenses = new Map<string, Expense>()

  seedOccurrence(occurrence: RecurringPaymentOccurrence): void {
    this.occurrences.set(occurrence.id, occurrence)
  }

  apply(
    authenticatedOwnerId: string,
    operation: SyncOperation,
    payload: CompoundPaymentPayload,
    injectFailureBeforeCommit = false,
  ): CompoundPaymentResult {
    if (
      operation.operationType !== 'pay_recurring_occurrence' ||
      operation.entityType !== 'recurringPaymentOccurrence' ||
      operation.entityId !== payload.occurrence.id
    ) {
      throw new Error('compound_operation_mismatch')
    }

    const processedOwner = this.processed.get(operation.operationId)
    if (processedOwner) {
      if (processedOwner !== authenticatedOwnerId)
        throw new Error('operation_id_belongs_to_another_user')
      return 'already_processed'
    }
    if (
      operation.ownerId !== authenticatedOwnerId ||
      payload.occurrence.ownerId !== authenticatedOwnerId ||
      payload.expense.ownerId !== authenticatedOwnerId
    ) {
      throw new Error('payload_owner_mismatch')
    }

    const current = this.occurrences.get(payload.occurrence.id)
    if (!current || current.ownerId !== authenticatedOwnerId)
      throw new Error('occurrence_not_found')

    const nextProcessed = new Map(this.processed)
    const nextOccurrences = new Map(this.occurrences)
    const nextExpenses = new Map(this.expenses)
    nextProcessed.set(operation.operationId, authenticatedOwnerId)

    const occurrenceWinner = referenceWinner(current, payload.occurrence)
    const currentExpense = nextExpenses.get(payload.expense.id)
    const expenseWinner = currentExpense
      ? referenceWinner(currentExpense, payload.expense)
      : 'remote'
    if (occurrenceWinner !== 'remote' || expenseWinner === 'local') {
      this.processed = nextProcessed
      return 'remote_wins'
    }

    nextOccurrences.set(payload.occurrence.id, {
      ...payload.occurrence,
      transactionId: payload.expense.id,
      syncStatus: 'synced',
    })
    nextExpenses.set(payload.expense.id, {
      ...payload.expense,
      syncStatus: 'synced',
    })
    if (injectFailureBeforeCommit) throw new Error('injected_remote_failure')

    this.processed = nextProcessed
    this.occurrences = nextOccurrences
    this.expenses = nextExpenses
    return 'applied'
  }

  get processedCount(): number {
    return this.processed.size
  }

  get expenseCount(): number {
    return this.expenses.size
  }

  getOccurrence(id: string): RecurringPaymentOccurrence | undefined {
    return this.occurrences.get(id)
  }

  getExpense(id: string): Expense | undefined {
    return this.expenses.get(id)
  }
}
