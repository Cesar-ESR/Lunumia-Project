import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { BalanceAnchor } from '@domain/entities'
import { GastoClaroDB } from './database'

const v1Stores = {
  periods:
    'id, ownerId, [ownerId+startDate], [ownerId+endDate], [ownerId+updatedAt]',
  incomes: 'id, ownerId, periodId, [ownerId+periodId], [ownerId+updatedAt]',
  expenses:
    'id, ownerId, periodId, categoryId, recurringOccurrenceId, [ownerId+periodId], [ownerId+categoryId], [ownerId+updatedAt]',
  categories: 'id, ownerId, [ownerId+normalizedName], [ownerId+updatedAt]',
  categoryBudgets:
    'id, ownerId, periodId, categoryId, [ownerId+periodId], [ownerId+periodId+categoryId], [ownerId+updatedAt]',
  recurringPayments:
    'id, ownerId, categoryId, status, [ownerId+status], [ownerId+updatedAt]',
  recurringPaymentOccurrences:
    'id, ownerId, periodId, recurringPaymentId, dueDate, status, [ownerId+periodId], [recurringPaymentId+dueDate], [ownerId+updatedAt]',
  syncOperations:
    'operationId, ownerId, status, createdAt, [ownerId+status+createdAt]',
  userSettings: 'id, ownerId, [ownerId+updatedAt]',
  deviceSyncStates: 'id, ownerId',
} as const

class LegacyDatabase extends Dexie {
  constructor(name: string, targetVersion: 1 | 2 | 3 = 3) {
    super(name)
    this.version(1).stores(v1Stores)
    if (targetVersion >= 2)
      this.version(2).stores({
        recurringPayments:
          'id, ownerId, categoryId, status, [ownerId+status], [ownerId+updatedAt]',
      })
    if (targetVersion >= 3)
      this.version(3).stores({
        syncOperations:
          'operationId, ownerId, status, createdAt, [ownerId+status+createdAt], [ownerId+status+createdAt+operationId]',
        deviceSyncStates: 'id, ownerId, entityType, &[ownerId+entityType]',
      })
  }
}

const createdAt = '2025-12-10T08:30:00.000Z'
const updatedAt = '2025-12-11T09:45:00.000Z'
const deletedAt = '2025-12-12T10:15:00.000Z'
const ownerId = 'owner-a'
const otherOwnerId = 'owner-b'
let sequence = 0
const databaseNames = new Set<string>()

const databaseName = (scenario: string): string => {
  const name = `lunumia-v4-${scenario}-${sequence++}`
  databaseNames.add(name)
  return name
}

const syncable = (id: string, owner = ownerId) => ({
  id,
  ownerId: owner,
  createdAt,
  updatedAt,
  deletedAt: null as string | null,
  syncStatus: 'pending' as const,
})

const legacyIncome = (id: string, tombstone = false) => ({
  ...syncable(id),
  periodId: 'period-1',
  amount: 125_000,
  description: `Income ${id}`,
  date: '2025-12-01',
  deletedAt: tombstone ? deletedAt : null,
})

const legacyExpense = (id: string, tombstone = false) => ({
  ...syncable(id),
  periodId: 'period-1',
  categoryId: 'category-1',
  amount: 25_000,
  description: `Expense ${id}`,
  date: '2025-12-02',
  recurringOccurrenceId: id === 'expense-1' ? 'occurrence-1' : null,
  deletedAt: tombstone ? deletedAt : null,
})

const recurringPayment = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...syncable('payment-1'),
  name: 'Legacy payment',
  amount: 37_500,
  frequency: 'monthly',
  dueDate: '2025-12-05',
  endDate: null,
  categoryId: 'category-1',
  status: 'active',
  ...overrides,
})

const legacyOccurrence = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...syncable('occurrence-1'),
  recurringPaymentId: 'payment-1',
  periodId: 'period-1',
  dueDate: '2025-12-05',
  status: 'paid',
  transactionId: 'legacy-transaction-1',
  ...overrides,
})

const openLegacy = async (
  name: string,
  version: 1 | 2 | 3 = 3,
): Promise<LegacyDatabase> => {
  const database = new LegacyDatabase(name, version)
  await database.open()
  return database
}

const openV4 = async (name: string): Promise<GastoClaroDB> => {
  const database = new GastoClaroDB(name)
  await database.open()
  return database
}

interface RowCounts {
  periods: number
  incomes: number
  expenses: number
  categories: number
  categoryBudgets: number
  recurringPayments: number
  recurringPaymentOccurrences: number
  userSettings: number
}

interface CountableDatabase {
  table(tableName: string): { count(): Promise<number> }
}

const tableCounts = async (database: CountableDatabase): Promise<RowCounts> => {
  const count = (tableName: string): Promise<number> =>
    database.table(tableName).count()
  return {
    periods: await count('periods'),
    incomes: await count('incomes'),
    expenses: await count('expenses'),
    categories: await count('categories'),
    categoryBudgets: await count('categoryBudgets'),
    recurringPayments: await count('recurringPayments'),
    recurringPaymentOccurrences: await count('recurringPaymentOccurrences'),
    userSettings: await count('userSettings'),
  }
}

afterEach(async () => {
  await Promise.all(
    [...databaseNames].map(async (name) => {
      await Dexie.delete(name)
      databaseNames.delete(name)
    }),
  )
})

describe('GastoClaroDB v4 migration', () => {
  it('upgrades an empty v3 database and creates an empty balanceAnchors store', async () => {
    const name = databaseName('empty')
    const legacy = await openLegacy(name)
    legacy.close()

    const database = await openV4(name)

    expect(database.verno).toBe(4)
    expect(database.tables.map((table) => table.name)).toContain(
      'balanceAnchors',
    )
    expect(
      database.balanceAnchors.schema.indexes.map((index) => index.name),
    ).toEqual([
      'ownerId',
      '[ownerId+capturedAt+updatedAt+id]',
      '[ownerId+updatedAt]',
    ])
    expect(await database.balanceAnchors.count()).toBe(0)
    database.close()

    const defaultDatabase = new GastoClaroDB()
    expect(defaultDatabase.name).toBe('GastoClaroDB')
    defaultDatabase.close()
  })

  it('migrates a representative legacy dataset without changing identity or row counts', async () => {
    const name = databaseName('representative')
    const legacy = await openLegacy(name)
    const period = {
      ...syncable('period-1'),
      type: 'monthly',
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    }
    const category = {
      ...syncable('category-1'),
      name: 'Home',
      normalizedName: 'home',
      color: '#123456',
      icon: null,
      isSystem: false,
    }
    const budget = {
      ...syncable('budget-1'),
      periodId: 'period-1',
      categoryId: 'category-1',
      amount: 50_000,
    }
    const payment = recurringPayment({ deletedAt })
    const occurrence = legacyOccurrence()
    const deletedOccurrence = legacyOccurrence({
      id: 'occurrence-deleted',
      deletedAt,
      transactionId: null,
    })
    const settings = {
      id: 'settings-1',
      ownerId,
      activePeriodId: 'period-1',
      currency: 'MXN',
      theme: 'system',
      createdAt,
      updatedAt,
    }

    await legacy.table('periods').add(period)
    await legacy
      .table('incomes')
      .bulkAdd([legacyIncome('income-1'), legacyIncome('income-deleted', true)])
    await legacy
      .table('expenses')
      .bulkAdd([
        legacyExpense('expense-1'),
        legacyExpense('expense-deleted', true),
      ])
    await legacy.table('categories').add(category)
    await legacy.table('categoryBudgets').add(budget)
    await legacy.table('recurringPayments').add(payment)
    await legacy
      .table('recurringPaymentOccurrences')
      .bulkAdd([occurrence, deletedOccurrence])
    await legacy.table('userSettings').add(settings)
    const before = await tableCounts(legacy as unknown as CountableDatabase)
    legacy.close()

    const database = await openV4(name)
    const after = await tableCounts(database as unknown as CountableDatabase)
    const incomes = await database.incomes.toArray()
    const expenses = await database.expenses.toArray()
    const migratedOccurrence =
      await database.recurringPaymentOccurrences.get('occurrence-1')

    expect(after).toEqual(before)
    expect(await database.balanceAnchors.count()).toBe(0)
    expect(incomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'income-1',
          ownerId,
          status: 'received',
          affectsBalance: true,
          balanceEffectiveAt: createdAt,
          createdAt,
          updatedAt,
          deletedAt: null,
          syncStatus: 'pending',
        }),
        expect.objectContaining({
          id: 'income-deleted',
          deletedAt,
          status: 'received',
          affectsBalance: true,
          balanceEffectiveAt: createdAt,
          syncStatus: 'pending',
        }),
      ]),
    )
    expect(expenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'expense-1',
          ownerId,
          recurringOccurrenceId: 'occurrence-1',
          affectsBalance: true,
          balanceEffectiveAt: createdAt,
          createdAt,
          updatedAt,
          deletedAt: null,
          syncStatus: 'pending',
        }),
        expect.objectContaining({
          id: 'expense-deleted',
          deletedAt,
          affectsBalance: true,
          balanceEffectiveAt: createdAt,
          syncStatus: 'pending',
        }),
      ]),
    )
    expect(migratedOccurrence).toEqual(
      expect.objectContaining({
        id: 'occurrence-1',
        ownerId,
        recurringPaymentId: 'payment-1',
        amount: 37_500,
        transactionId: 'legacy-transaction-1',
        createdAt,
        updatedAt,
        deletedAt: null,
        syncStatus: 'pending',
      }),
    )
    expect(
      await database.recurringPaymentOccurrences.get('occurrence-deleted'),
    ).toEqual(
      expect.objectContaining({
        amount: 37_500,
        deletedAt,
        transactionId: null,
      }),
    )
    expect((await database.recurringPayments.get('payment-1'))?.deletedAt).toBe(
      deletedAt,
    )
    database.close()

    const reopened = await openV4(name)
    expect(reopened.verno).toBe(4)
    expect(await tableCounts(reopened as unknown as CountableDatabase)).toEqual(
      before,
    )
    expect(await reopened.balanceAnchors.count()).toBe(0)
    expect(
      await reopened.recurringPaymentOccurrences.get('occurrence-1'),
    ).toEqual(expect.objectContaining({ amount: 37_500 }))
    reopened.close()
  })

  it('stores positive, zero, and negative signed BalanceAnchor amounts', async () => {
    const name = databaseName('signed-anchors')
    const database = await openV4(name)
    const amounts = [100_000, 0, -25_000]
    const anchors: BalanceAnchor[] = amounts.map((amount, index) => ({
      ...syncable(`anchor-${index}`),
      amount,
      capturedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      ledgerCutoffAt: `2025-12-3${index}T23:59:59.999Z`,
    }))

    await database.balanceAnchors.bulkAdd(anchors)

    expect(
      (await database.balanceAnchors.orderBy('id').toArray()).map(
        (anchor) => anchor.amount,
      ),
    ).toEqual(amounts)
    database.close()
  })

  it('aborts atomically when an occurrence has no recurring payment', async () => {
    const name = databaseName('orphan')
    const legacy = await openLegacy(name)
    await legacy.table('incomes').add(legacyIncome('income-1'))
    await legacy.table('expenses').add(legacyExpense('expense-1'))
    await legacy.table('recurringPaymentOccurrences').add(legacyOccurrence())
    legacy.close()

    const failedUpgrade = new GastoClaroDB(name)
    await expect(failedUpgrade.open()).rejects.toThrow(
      /matching recurring payment was not found for owner owner-a/,
    )
    failedUpgrade.close()

    const preserved = await openLegacy(name)
    expect(preserved.verno).toBe(3)
    expect(await preserved.table('incomes').get('income-1')).not.toHaveProperty(
      'status',
    )
    expect(
      await preserved.table('expenses').get('expense-1'),
    ).not.toHaveProperty('affectsBalance')
    expect(
      await preserved.table('recurringPaymentOccurrences').get('occurrence-1'),
    ).not.toHaveProperty('amount')
    expect(preserved.tables.map((table) => table.name)).not.toContain(
      'balanceAnchors',
    )
    preserved.close()
  })

  it('aborts when the referenced payment belongs to another owner', async () => {
    const name = databaseName('owner-mismatch')
    const legacy = await openLegacy(name)
    await legacy
      .table('recurringPayments')
      .add(recurringPayment({ ownerId: otherOwnerId }))
    await legacy.table('recurringPaymentOccurrences').add(legacyOccurrence())
    legacy.close()

    const database = new GastoClaroDB(name)
    await expect(database.open()).rejects.toThrow(
      /belongs to owner owner-b, not owner-a/,
    )
    database.close()
  })

  it.each([0, -1, 1.5, '100'])(
    'aborts when the parent payment amount is invalid: %s',
    async (amount) => {
      const name = databaseName(`invalid-payment-${String(amount)}`)
      const legacy = await openLegacy(name)
      await legacy.table('recurringPayments').add(recurringPayment({ amount }))
      await legacy.table('recurringPaymentOccurrences').add(legacyOccurrence())
      legacy.close()

      const database = new GastoClaroDB(name)
      await expect(database.open()).rejects.toThrow(
        /payment payment-1 amount must be a positive integer/,
      )
      database.close()
    },
  )

  it('preserves an existing valid occurrence amount', async () => {
    const name = databaseName('existing-amount')
    const legacy = await openLegacy(name)
    await legacy
      .table('recurringPayments')
      .add(recurringPayment({ amount: 900 }))
    await legacy
      .table('recurringPaymentOccurrences')
      .add(legacyOccurrence({ amount: 700 }))
    legacy.close()

    const database = await openV4(name)
    const occurrence =
      await database.recurringPaymentOccurrences.get('occurrence-1')
    expect(
      occurrence && 'amount' in occurrence ? occurrence.amount : null,
    ).toBe(700)
    database.close()
  })

  it('aborts instead of repairing an existing invalid occurrence amount', async () => {
    const name = databaseName('invalid-existing-amount')
    const legacy = await openLegacy(name)
    await legacy.table('recurringPayments').add(recurringPayment())
    await legacy
      .table('recurringPaymentOccurrences')
      .add(legacyOccurrence({ amount: 0 }))
    legacy.close()

    const database = new GastoClaroDB(name)
    await expect(database.open()).rejects.toThrow(
      /existing amount must be a positive integer/,
    )
    database.close()
  })

  it.each([1, 2] as const)(
    'keeps the legacy v%s upgrade path valid through v4',
    async (legacyVersion) => {
      const name = databaseName(`legacy-v${legacyVersion}`)
      const legacy = await openLegacy(name, legacyVersion)
      legacy.close()

      const database = await openV4(name)

      expect(database.verno).toBe(4)
      expect(await database.balanceAnchors.count()).toBe(0)
      database.close()
    },
  )
})
