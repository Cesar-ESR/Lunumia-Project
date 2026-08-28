import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  CategoryBudget,
  Category,
  Expense,
  Income,
  Period,
  RecurringPaymentOccurrence,
  SyncOperation,
  UserSettings,
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

  it('reemplaza atómicamente un alias de periodo y reescribe todas sus referencias y payloads', async () => {
    const canonicalId = '21000000-0000-4000-8000-000000000021'
    const incomeId = '41000000-0000-4000-8000-000000000041'
    const expenseId = '42000000-0000-4000-8000-000000000042'
    const budgetId = '43000000-0000-4000-8000-000000000043'
    const occurrenceId = '44000000-0000-4000-8000-000000000044'
    const settingsId = '45000000-0000-4000-8000-000000000045'
    const categoryId = '46000000-0000-4000-8000-000000000046'
    const paymentId = '47000000-0000-4000-8000-000000000047'
    const alias = period(firstInstant)
    const canonical: Period = {
      ...alias,
      id: canonicalId,
      updatedAt: secondInstant,
      syncStatus: 'synced',
    }
    const income: Income = {
      id: incomeId,
      ownerId,
      periodId,
      amount: 123_45,
      description: 'Nómina',
      date: '2026-08-02',
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: firstInstant,
      createdAt: firstInstant,
      updatedAt: firstInstant,
      deletedAt: null,
      syncStatus: 'pending',
    }
    const expense: Expense = {
      id: expenseId,
      ownerId,
      periodId,
      categoryId,
      amount: 45_67,
      description: 'Servicio',
      date: '2026-08-03',
      recurringOccurrenceId: occurrenceId,
      affectsBalance: true,
      balanceEffectiveAt: firstInstant,
      createdAt: firstInstant,
      updatedAt: firstInstant,
      deletedAt: null,
      syncStatus: 'pending',
    }
    const budget: CategoryBudget = {
      id: budgetId,
      ownerId,
      periodId,
      categoryId,
      amount: 80_00,
      createdAt: firstInstant,
      updatedAt: firstInstant,
      deletedAt: null,
      syncStatus: 'pending',
    }
    const occurrence: RecurringPaymentOccurrence = {
      id: occurrenceId,
      ownerId,
      recurringPaymentId: paymentId,
      periodId,
      dueDate: '2026-08-03',
      status: 'paid',
      transactionId: expenseId,
      amount: expense.amount,
      createdAt: firstInstant,
      updatedAt: firstInstant,
      deletedAt: null,
      syncStatus: 'pending',
    }
    const settings: UserSettings = {
      id: settingsId,
      ownerId,
      activePeriodId: periodId,
      currency: 'MXN',
      theme: 'dark',
      createdAt: firstInstant,
      updatedAt: firstInstant,
    }
    const aliasOperation: SyncOperation = {
      ...queuedOperation('processing'),
      operationType: 'create',
      payload: JSON.stringify(alias),
    }
    const incomeOperation: SyncOperation = {
      ...queuedOperation('error'),
      operationId: '51000000-0000-4000-8000-000000000051',
      entityType: 'income',
      entityId: incomeId,
      operationType: 'create',
      payload: JSON.stringify(income),
    }
    const compoundOperation: SyncOperation = {
      ...queuedOperation('pending'),
      operationId: '52000000-0000-4000-8000-000000000052',
      entityType: 'recurringPaymentOccurrence',
      entityId: occurrenceId,
      operationType: 'pay_recurring_occurrence',
      payload: JSON.stringify({ occurrence, expense }),
    }
    const settingsOperation: SyncOperation = {
      ...queuedOperation('pending'),
      operationId: '53000000-0000-4000-8000-000000000053',
      entityType: 'userSettings',
      entityId: settingsId,
      operationType: 'update',
      payload: JSON.stringify(settings),
    }
    const unrelatedPeriod = {
      ...period(firstInstant),
      id: '22000000-0000-4000-8000-000000000022',
      startDate: '2026-09-01' as const,
      endDate: '2026-09-30' as const,
    }
    const unrelatedOperation: SyncOperation = {
      ...queuedOperation('pending'),
      operationId: '54000000-0000-4000-8000-000000000054',
      entityId: unrelatedPeriod.id,
      payload: JSON.stringify(unrelatedPeriod),
    }

    await database.periods.bulkPut([alias, unrelatedPeriod])
    await database.incomes.put(income)
    await database.expenses.put(expense)
    await database.categoryBudgets.put(budget)
    await database.recurringPaymentOccurrences.put(occurrence)
    await database.userSettings.put(settings)
    await database.syncOperations.bulkPut([
      aliasOperation,
      incomeOperation,
      compoundOperation,
      settingsOperation,
      unrelatedOperation,
    ])

    await store.reconcileEquivalentPeriod(
      aliasOperation,
      canonical,
      secondInstant,
    )

    expect(await database.periods.get(periodId)).toBeUndefined()
    expect(await database.periods.get(canonicalId)).toEqual(canonical)
    expect(await database.periods.get(unrelatedPeriod.id)).toEqual(
      unrelatedPeriod,
    )
    expect(await database.incomes.get(incomeId)).toMatchObject({
      periodId: canonicalId,
      amount: income.amount,
      description: income.description,
      date: income.date,
      syncStatus: 'pending',
    })
    expect(await database.expenses.get(expenseId)).toMatchObject({
      periodId: canonicalId,
      amount: expense.amount,
      categoryId,
      syncStatus: 'pending',
    })
    expect(await database.categoryBudgets.get(budgetId)).toMatchObject({
      periodId: canonicalId,
      amount: budget.amount,
      syncStatus: 'pending',
    })
    expect(
      await database.recurringPaymentOccurrences.get(occurrenceId),
    ).toMatchObject({
      periodId: canonicalId,
      amount: occurrence.amount,
      transactionId: expenseId,
      syncStatus: 'pending',
    })
    expect(await database.userSettings.get(settingsId)).toEqual({
      ...settings,
      activePeriodId: canonicalId,
      updatedAt: secondInstant,
    })

    const operations = await database.syncOperations.toArray()
    expect(operations.some((value) => value.entityId === periodId)).toBe(false)
    expect(operations).toContainEqual(unrelatedOperation)
    const rewrittenIncome = operations.find(
      (value) => value.operationId === incomeOperation.operationId,
    )
    expect(rewrittenIncome).toMatchObject({
      status: 'error',
      retryCount: incomeOperation.retryCount,
    })
    expect(JSON.parse(rewrittenIncome?.payload ?? '{}')).toMatchObject({
      id: incomeId,
      periodId: canonicalId,
      amount: income.amount,
    })
    const rewrittenCompound = JSON.parse(
      operations.find(
        (value) => value.operationId === compoundOperation.operationId,
      )?.payload ?? '{}',
    ) as Record<string, { periodId: string; amount: number }>
    expect(rewrittenCompound.occurrence).toMatchObject({
      periodId: canonicalId,
      amount: occurrence.amount,
    })
    expect(rewrittenCompound.expense).toMatchObject({
      periodId: canonicalId,
      amount: expense.amount,
    })
    expect(
      operations.filter(
        (value) =>
          value.entityType === 'categoryBudget' && value.entityId === budgetId,
      ),
    ).toHaveLength(1)
    expect(operations.some((value) => value.payload.includes(periodId))).toBe(
      false,
    )
  })

  it('revierte por completo la reconciliación si falla después de reescribir referencias', async () => {
    const alias = period(firstInstant)
    const canonical: Period = {
      ...alias,
      id: '23000000-0000-4000-8000-000000000023',
      syncStatus: 'synced',
    }
    const aliasOperation: SyncOperation = {
      ...queuedOperation('processing'),
      operationType: 'create',
      payload: JSON.stringify(alias),
    }
    const income: Income = {
      id: '48000000-0000-4000-8000-000000000048',
      ownerId,
      periodId,
      amount: 100,
      description: 'Prueba',
      date: '2026-08-02',
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: firstInstant,
      createdAt: firstInstant,
      updatedAt: firstInstant,
      deletedAt: null,
      syncStatus: 'pending',
    }
    await database.periods.put(alias)
    await database.incomes.put(income)
    await database.syncOperations.put(aliasOperation)
    const failingStore = new DexieSyncStore(database, undefined, (step) => {
      if (step.endsWith(':references-rewritten')) throw new Error('fallo')
    })

    await expect(
      failingStore.reconcileEquivalentPeriod(
        aliasOperation,
        canonical,
        secondInstant,
      ),
    ).rejects.toThrow('fallo')

    expect(await database.periods.get(periodId)).toEqual(alias)
    expect(await database.periods.get(canonical.id)).toBeUndefined()
    expect(await database.incomes.get(income.id)).toEqual(income)
    expect(await database.syncOperations.toArray()).toEqual([aliasOperation])
  })
})
