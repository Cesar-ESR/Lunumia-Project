import { afterEach, describe, expect, it } from 'vitest'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexieIncomeRepository,
  DexieExpenseRepository,
  DexiePeriodRepository,
  DexieCategoryRepository,
  DexieBalanceAnchorRepository,
  DexieRecurringPaymentOccurrenceRepository,
  DexieCategoryBudgetRepository,
} from '@infrastructure/local/repositories'
import { DexieRecurringPaymentTransaction } from '@infrastructure/local/transactions/DexieRecurringPaymentTransaction'
import { UpdateIncome } from '@application/use-cases/incomes/UpdateIncome'
import { DeleteIncome } from '@application/use-cases/incomes/DeleteIncome'
import { UpdateExpense } from '@application/use-cases/expenses/UpdateExpense'
import { DeleteExpense } from '@application/use-cases/expenses/DeleteExpense'
import { GetFinancialSnapshot } from '@application/use-cases/dashboard/GetFinancialSnapshot'
import { GetCategoryBudgetSummaries } from '@application/use-cases/budgets/GetCategoryBudgetSummaries'
import { DexieSyncStore } from '@infrastructure/sync/DexieSyncStore'
import {
  createPeriodMock,
  createIncomeMock,
  createExpenseMock,
  createCategoryMock,
  createBudgetMock,
  PERIOD_ID,
  CATEGORY_ID,
} from '@presentation/test/test-factories'

const now = '2026-07-20T12:00:00.000Z'
const clock = { now: () => now }
let db: GastoClaroDB
afterEach(async () => {
  await db?.delete()
})

async function setup(ownerId: string) {
  db = new GastoClaroDB(`movement-edit-${crypto.randomUUID()}`)
  const sync = { clock, ids: { generate: () => crypto.randomUUID() } }
  const incomes = new DexieIncomeRepository(db, ownerId, sync)
  const expenses = new DexieExpenseRepository(db, ownerId, sync)
  const periods = new DexiePeriodRepository(db, ownerId, sync)
  const categories = new DexieCategoryRepository(db, ownerId, sync)
  const categoryB = crypto.randomUUID()
  await db.periods.add(createPeriodMock({ ownerId }))
  await db.categories.bulkAdd([
    createCategoryMock({ ownerId }),
    createCategoryMock({
      ownerId,
      id: categoryB,
      name: 'Otro',
      normalizedName: 'otro',
    }),
  ])
  await db.categoryBudgets.add(createBudgetMock({ ownerId, amount: 50000 }))
  await db.balanceAnchors.add({
    id: crypto.randomUUID(),
    ownerId,
    amount: 10000,
    capturedAt: '2026-07-01T00:00:00.000Z',
    ledgerCutoffAt: '2026-07-01T00:00:00.000Z',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 'synced',
  })
  const a = createIncomeMock({
    ownerId,
    id: crypto.randomUUID(),
    amount: 100000,
  })
  const c = createIncomeMock({
    ownerId,
    id: crypto.randomUUID(),
    amount: 20000,
  })
  const d = createIncomeMock({
    ownerId,
    id: crypto.randomUUID(),
    amount: 30000,
  })
  const expense = createExpenseMock({ ownerId, amount: 12000 })
  for (const income of [a, c, d]) await incomes.create(income)
  await expenses.create(expense)
  const snapshot = new GetFinancialSnapshot(
    periods,
    new DexieBalanceAnchorRepository(db, ownerId),
    incomes,
    expenses,
    new DexieRecurringPaymentOccurrenceRepository(db, ownerId),
    clock,
  )
  return {
    incomes,
    expenses,
    a,
    c,
    d,
    expense,
    categoryB,
    balance: async () => (await snapshot.execute()).currentBalanceCents,
    budgets: new GetCategoryBudgetSummaries(
      new DexieCategoryBudgetRepository(db, ownerId),
      expenses,
      categories,
    ),
    editIncome: new UpdateIncome(incomes, periods, clock),
    deleteIncome: new DeleteIncome(incomes),
    editExpense: new UpdateExpense(expenses, periods, categories, clock),
    deleteExpense: new DeleteExpense(
      expenses,
      new DexieRecurringPaymentTransaction(db, sync.ids, clock),
    ),
  }
}

describe.each(['guest:qa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])(
  'movement local-first (%s)',
  (ownerId) => {
    it('golden QA: 1480 → 1530 → 1330, una identidad y tombstone tras reload/pull', async () => {
      const s = await setup(ownerId)
      expect(await s.balance()).toBe(148000)
      await s.editIncome.execute(s.d.id, { ...s.d, amount: 35000 })
      expect(await s.balance()).toBe(153000)
      expect(await s.incomes.findAll()).toHaveLength(3)
      expect(await s.incomes.findById(s.d.id)).toMatchObject({
        id: s.d.id,
        createdAt: s.d.createdAt,
        ownerId,
        balanceEffectiveAt: s.d.balanceEffectiveAt,
        amount: 35000,
      })
      await s.deleteIncome.execute(s.c.id)
      expect(await s.balance()).toBe(133000)
      db.close()
      await db.open()
      expect(await s.balance()).toBe(133000)
      expect((await s.incomes.findAll()).map((i) => i.amount).sort()).toEqual(
        [35000, 100000].sort(),
      )
      expect(await db.incomes.get(s.c.id)).toMatchObject({ deletedAt: now })
      const ops = await db.syncOperations.toArray()
      if (ownerId.startsWith('guest')) expect(ops).toHaveLength(0)
      else {
        expect(
          ops
            .filter((o) => o.entityId === s.d.id)
            .map((o) => o.operationType)
            .sort(),
        ).toEqual(['create', 'update'])
        expect(
          ops
            .filter((o) => o.entityId === s.c.id)
            .map((o) => o.operationType)
            .sort(),
        ).toEqual(['create', 'delete'])
      }
      const store = new DexieSyncStore(db)
      await store.applyRemotePage(
        ownerId,
        'income',
        [{ entityType: 'income', record: s.c }],
        { lastUpdatedAt: s.c.updatedAt, lastEntityId: s.c.id },
      )
      expect(await s.incomes.findById(s.c.id)).toBeNull()
      expect(await s.balance()).toBe(133000)
    })
    it('reemplaza gasto, mueve categoría y periodo, elimina y recalcula presupuesto', async () => {
      const s = await setup(ownerId)
      const summaries = (periodId = PERIOD_ID) =>
        s.budgets.execute({ ownerId, periodId })
      await s.editExpense.execute(s.expense.id, { ...s.expense, amount: 15000 })
      expect(await s.balance()).toBe(145000)
      expect(
        (await summaries()).find((b) => b.categoryId === CATEGORY_ID)
          ?.spentCents,
      ).toBe(15000)
      await s.editExpense.execute(s.expense.id, {
        ...s.expense,
        amount: 15000,
        categoryId: s.categoryB,
      })
      expect(
        (await summaries()).find((b) => b.categoryId === CATEGORY_ID)
          ?.spentCents,
      ).toBe(0)
      expect(
        (await summaries()).find((b) => b.categoryId === s.categoryB)
          ?.spentCents,
      ).toBe(15000)
      const next = createPeriodMock({
        ownerId,
        id: crypto.randomUUID(),
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      })
      await db.periods.add(next)
      await s.editExpense.execute(s.expense.id, {
        ...s.expense,
        date: '2026-08-02',
      })
      expect(await s.expenses.findByPeriod(PERIOD_ID)).toHaveLength(0)
      expect(await s.expenses.findByPeriod(next.id)).toHaveLength(1)
      await s.deleteExpense.execute(s.expense.id)
      expect(await s.balance()).toBe(160000)
      expect((await summaries(next.id)).every((b) => b.spentCents === 0)).toBe(
        true,
      )
      expect(await db.expenses.get(s.expense.id)).toMatchObject({
        deletedAt: now,
      })
    })
  },
)

it('reintenta update/delete sin perder tombstone ni aplicar un pull antiguo', async () => {
  const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const s = await setup(ownerId)
  // Simulate the original create being acknowledged before subsequent offline edits.
  const store = new DexieSyncStore(db)
  const result = {
    status: 'applied' as const,
    entityUpdatedAt: now,
    relatedEntityId: null,
    relatedUpdatedAt: null,
  }
  for (const operation of await store.findUploadable(ownerId))
    await store.completeUpload(operation, result)
  await s.editIncome.execute(s.d.id, { ...s.d, amount: 35000 })
  const update = (await store.findUploadable(ownerId))[0]!
  await store.markUploadError(update, 'offline')
  await s.deleteIncome.execute(s.d.id)
  const queued = await store.findUploadable(ownerId)
  expect(queued).toHaveLength(2)
  expect(
    queued.find((o) => o.operationId === update.operationId),
  ).toMatchObject({ retryCount: 1, status: 'error' })
  await store.completeUpload(update, { ...result, status: 'already_processed' })
  expect(await db.incomes.get(s.d.id)).toMatchObject({
    deletedAt: now,
    syncStatus: 'pending',
  })
  const deletion = (await store.findUploadable(ownerId))[0]!
  expect(JSON.parse(deletion.payload)).toMatchObject({
    amount: 35000,
    deletedAt: now,
    ownerId,
  })
  await store.completeUpload(deletion, result)
  await store.applyRemotePage(
    ownerId,
    'income',
    [{ entityType: 'income', record: s.d }],
    { lastUpdatedAt: s.d.updatedAt, lastEntityId: s.d.id },
  )
  expect(await s.incomes.findById(s.d.id)).toBeNull()
  expect(await db.syncOperations.count()).toBe(0)
})

it('rechaza ownership ajeno y fechas sin periodo sin modificar registros', async () => {
  const s = await setup('guest:qa')
  await expect(
    s.editIncome.execute(s.d.id, { ...s.d, ownerId: 'guest:other' }),
  ).rejects.toThrow()
  await expect(
    s.editExpense.execute(s.expense.id, { ...s.expense, date: '2027-01-01' }),
  ).rejects.toThrow()
  expect(await s.balance()).toBe(148000)
})

it('revierte escritura y cola juntas si falla encolar update/delete', async () => {
  const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const s = await setup(ownerId)
  const failing = new DexieIncomeRepository(db, ownerId, {
    clock,
    ids: {
      generate: () => {
        throw new Error('internal queue error')
      },
    },
  })
  const count = await db.syncOperations.count()
  await expect(failing.update({ ...s.d, amount: 35000 })).rejects.toThrow()
  await expect(failing.delete(s.d.id)).rejects.toThrow()
  expect(await db.syncOperations.count()).toBe(count)
  expect(await s.incomes.findById(s.d.id)).toMatchObject({
    amount: 30000,
    deletedAt: null,
  })
})
