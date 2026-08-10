import type { Table } from 'dexie'
import type {
  SyncEntityType,
  SyncOperation,
  SyncOperationType,
} from '@domain/entities'
import type { Instant } from '@domain/value-objects'
import { GastoClaroDB } from './database'

export interface SyncMutationDependencies {
  ids: { generate(): string }
  clock: { now(): Instant }
  origin: 'local-user' | 'remote-apply'
}

const defaultDependencies: SyncMutationDependencies = {
  ids: { generate: () => globalThis.crypto.randomUUID() },
  clock: { now: () => new Date().toISOString() },
  origin: 'local-user',
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const REMOTE_TABLE_BY_ENTITY_TYPE: Readonly<
  Record<SyncEntityType, string>
> = {
  period: 'periods',
  income: 'incomes',
  expense: 'expenses',
  category: 'categories',
  categoryBudget: 'category_budgets',
  recurringPayment: 'recurring_payments',
  recurringPaymentOccurrence: 'recurring_payment_occurrences',
  userSettings: 'user_settings',
}

export function isAuthenticatedOwnerId(ownerId: string): boolean {
  return isUuid(ownerId)
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value)
}

export function resolveSyncDependencies(
  dependencies?: Partial<SyncMutationDependencies>,
): SyncMutationDependencies {
  return {
    ids: dependencies?.ids ?? defaultDependencies.ids,
    clock: dependencies?.clock ?? defaultDependencies.clock,
    origin: dependencies?.origin ?? defaultDependencies.origin,
  }
}

export function createSyncOperation(
  dependencies: SyncMutationDependencies,
  ownerId: string,
  entityType: SyncEntityType,
  entityId: string,
  operationType: SyncOperationType,
  payload: unknown,
  createdAt = dependencies.clock.now(),
): SyncOperation {
  if (!isAuthenticatedOwnerId(ownerId)) {
    throw new Error(
      'Las operaciones de sincronización requieren un ownerId autenticado.',
    )
  }
  const operationId = dependencies.ids.generate()
  if (!isUuid(operationId))
    throw new Error('operationId debe ser un UUID válido.')
  const serializedPayload = JSON.stringify(payload)
  if (typeof serializedPayload !== 'string')
    throw new Error('El payload de sincronización debe ser JSON serializable.')
  return {
    operationId,
    ownerId,
    entityType,
    entityId,
    operationType,
    payload: serializedPayload,
    createdAt,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
  }
}

export async function persistLocalMutation<
  T extends { id: string; ownerId: string },
>(
  db: GastoClaroDB,
  table: Table<T, string>,
  ownerId: string,
  entityType: SyncEntityType,
  operationType:
    | Exclude<SyncOperationType, 'pay_recurring_occurrence'>
    | (() => Exclude<SyncOperationType, 'pay_recurring_occurrence'>),
  dependencies: SyncMutationDependencies,
  write: () => Promise<T>,
): Promise<T> {
  return db.transaction('rw', table, db.syncOperations, async () => {
    const result = await write()
    if (result.ownerId !== ownerId)
      throw new Error('La entidad no pertenece al propietario del repositorio.')
    if (
      dependencies.origin === 'local-user' &&
      isAuthenticatedOwnerId(ownerId)
    ) {
      await db.syncOperations.add(
        createSyncOperation(
          dependencies,
          ownerId,
          entityType,
          result.id,
          typeof operationType === 'function' ? operationType() : operationType,
          result,
        ),
      )
    }
    return result
  })
}

export async function persistOptionalLocalMutation<
  T extends { id: string; ownerId: string },
>(
  db: GastoClaroDB,
  table: Table<T, string>,
  ownerId: string,
  entityType: SyncEntityType,
  operationType: Exclude<SyncOperationType, 'pay_recurring_occurrence'>,
  dependencies: SyncMutationDependencies,
  write: () => Promise<T | null>,
): Promise<T | null> {
  return db.transaction('rw', table, db.syncOperations, async () => {
    const result = await write()
    if (!result) return null
    if (result.ownerId !== ownerId)
      throw new Error('La entidad no pertenece al propietario del repositorio.')
    if (
      dependencies.origin === 'local-user' &&
      isAuthenticatedOwnerId(ownerId)
    ) {
      await db.syncOperations.add(
        createSyncOperation(
          dependencies,
          ownerId,
          entityType,
          result.id,
          operationType,
          result,
        ),
      )
    }
    return result
  })
}
