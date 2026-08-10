import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  Category,
  Expense,
  Period,
  RecurringPaymentOccurrence,
  SyncOperation,
} from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieSyncStore } from './DexieSyncStore'

const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000002'
const firstInstant = '2026-08-01T10:00:00.000Z'
const secondInstant = '2026-08-01T11:00:00.000Z'
const thirdInstant = '2026-08-01T12:00:00.000Z'

function period(
  updatedAt: string,
  syncStatus: Period['syncStatus'] = 'pending',
): Period {
  return {
    id: periodId,
    ownerId,
    type: 'monthly',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    createdAt: firstInstant,
    updatedAt,
    deletedAt: null,
    syncStatus,
  }
}

function queuedOperation(
  status: SyncOperation['status'] = 'error',
): SyncOperation {
  return {
    operationId: '30000000-0000-4000-8000-000000000003',
    ownerId,
    entityType: 'period',
    entityId: periodId,
    operationType: 'update',
    payload: JSON.stringify(period(secondInstant)),
    createdAt: secondInstant,
    status,
    errorMessage: status === 'error' ? 'red' : null,
    retryCount: status === 'error' ? 1 : 0,
  }
}

let database: GastoClaroDB
let store: DexieSyncStore

beforeEach(() => {
  database = new GastoClaroDB(`sync-store-${crypto.randomUUID()}`)
  store = new DexieSyncStore(database)
})
afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

describe('DexieSyncStore', () => {
  it('reintenta estados error/processing y confirma cola + entidad atómicamente', async () => {
    await database.periods.put(period(secondInstant))
    const operation = queuedOperation('error')
    await database.syncOperations.put(operation)

    expect(await store.findUploadable(ownerId)).toEqual([operation])
    await store.completeUpload(operation, {
      status: 'applied',
      entityUpdatedAt: thirdInstant,
      relatedEntityId: null,
      relatedUpdatedAt: null,
    })

    expect(await database.syncOperations.count()).toBe(0)
    expect(await database.periods.get(periodId)).toMatchObject({
      updatedAt: thirdInstant,
      syncStatus: 'synced',
    })
  })

  it('aplica LWW, avanza el cursor y nunca crea una operación local', async () => {
    await database.periods.put(period(secondInstant))
    const older = period(firstInstant, 'synced')
    const skipped = await store.applyRemotePage(
      ownerId,
      'period',
      [{ entityType: 'period', record: older }],
      { lastUpdatedAt: firstInstant, lastEntityId: periodId },
    )
    expect(skipped).toEqual({ downloaded: 0, skipped: 1, conflicts: 1 })

    const newer = {
      ...period(thirdInstant, 'synced'),
      type: 'biweekly' as const,
    }
    const applied = await store.applyRemotePage(
      ownerId,
      'period',
      [{ entityType: 'period', record: newer }],
      { lastUpdatedAt: thirdInstant, lastEntityId: periodId },
    )
    expect(applied).toEqual({ downloaded: 1, skipped: 0, conflicts: 1 })
    expect(await database.periods.get(periodId)).toEqual(newer)
    expect(await database.syncOperations.count()).toBe(0)
    expect(await store.getCursor(ownerId, 'period')).toEqual({
      lastUpdatedAt: thirdInstant,
      lastEntityId: periodId,
    })
  })

  it('conserva tombstones remotos en la réplica local sin reencolarlos', async () => {
    const tombstone: Category = {
      id: '40000000-0000-4000-8000-000000000004',
      ownerId,
      name: 'Comida',
      normalizedName: 'comida',
      color: '#123ABC',
      icon: null,
      isSystem: false,
      createdAt: firstInstant,
      updatedAt: secondInstant,
      deletedAt: secondInstant,
      syncStatus: 'synced',
    }
    await store.applyRemotePage(
      ownerId,
      'category',
      [{ entityType: 'category', record: tombstone }],
      { lastUpdatedAt: secondInstant, lastEntityId: tombstone.id },
    )

    expect(await database.categories.get(tombstone.id)).toEqual(tombstone)
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('reconstruye transactionId desde expenses.recurring_occurrence_id', async () => {
    const occurrenceId = '50000000-0000-4000-8000-000000000005'
    const expenseId = '60000000-0000-4000-8000-000000000006'
    const occurrence: RecurringPaymentOccurrence = {
      id: occurrenceId,
      ownerId,
      recurringPaymentId: '70000000-0000-4000-8000-000000000007',
      periodId,
      dueDate: '2026-08-10',
      status: 'paid',
      transactionId: null,
      createdAt: firstInstant,
      updatedAt: secondInstant,
      deletedAt: null,
      syncStatus: 'synced',
    }
    const expense: Expense = {
      id: expenseId,
      ownerId,
      periodId,
      categoryId: '80000000-0000-4000-8000-000000000008',
      amount: 12500,
      description: 'Internet',
      date: '2026-08-10',
      recurringOccurrenceId: occurrenceId,
      createdAt: firstInstant,
      updatedAt: secondInstant,
      deletedAt: null,
      syncStatus: 'synced',
    }
    await store.applyRemotePage(
      ownerId,
      'recurringPaymentOccurrence',
      [{ entityType: 'recurringPaymentOccurrence', record: occurrence }],
      { lastUpdatedAt: secondInstant, lastEntityId: occurrenceId },
    )
    await store.applyRemotePage(
      ownerId,
      'expense',
      [{ entityType: 'expense', record: expense }],
      { lastUpdatedAt: secondInstant, lastEntityId: expenseId },
    )

    expect(
      await database.recurringPaymentOccurrences.get(occurrenceId),
    ).toMatchObject({
      status: 'paid',
      transactionId: expenseId,
    })
    expect(await database.syncOperations.count()).toBe(0)
  })
})
