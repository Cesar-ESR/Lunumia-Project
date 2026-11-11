import { afterEach, expect, it } from 'vitest'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieCategoryBudgetRepository } from '@infrastructure/local/repositories/DexieCategoryBudgetRepository'
import { DexieExpenseRepository } from '@infrastructure/local/repositories/DexieExpenseRepository'
import { DexiePeriodRepository } from '@infrastructure/local/repositories/DexiePeriodRepository'
import { DexieCategoryRepository } from '@infrastructure/local/repositories/DexieCategoryRepository'
import { UpdateExpense } from '../expenses/UpdateExpense'
import { GetDashboardBudgetSummary } from '../dashboard/GetDashboardBudgetSummary'
import { GetCategoryBudgetSummaries } from './GetCategoryBudgetSummaries'
import type { ExpenseV2, Period } from '@domain/entities'

const dbs: GastoClaroDB[] = []
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})
const p = '20000000-0000-4000-8000-000000000002'
const c = '30000000-0000-4000-8000-000000000003'
const other = '30000000-0000-4000-8000-000000000004'
const next = '20000000-0000-4000-8000-000000000005'
const now = '2026-09-01T10:00:00.000Z'
const base = {
  ownerId: 'guest',
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  syncStatus: 'pending' as const,
}
async function setup() {
  const db = new GastoClaroDB(`budget-integrity-${crypto.randomUUID()}`)
  dbs.push(db)
  const period: Period = {
    ...base,
    id: p,
    type: 'monthly',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
  }
  await db.periods.bulkAdd([
    period,
    { ...period, id: next, startDate: '2026-10-01', endDate: '2026-10-31' },
  ])
  await db.categories.bulkAdd(
    [c, other].map((id) => ({
      ...base,
      id,
      name: id,
      normalizedName: id,
      color: '#000000',
      icon: null,
      isSystem: false,
    })),
  )
  const budgets = new DexieCategoryBudgetRepository(db, 'guest')
  const expenses = new DexieExpenseRepository(db, 'guest')
  const categories = new DexieCategoryRepository(db, 'guest')
  const update = new UpdateExpense(
    expenses,
    new DexiePeriodRepository(db, 'guest'),
    categories,
    { now: () => now },
  )
  await budgets.upsert({
    ...base,
    id: crypto.randomUUID(),
    periodId: p,
    categoryId: c,
    amount: 100000,
  })
  const query = new GetDashboardBudgetSummary(budgets, expenses)
  const rows = new GetCategoryBudgetSummaries(budgets, expenses, categories)
  const expense = (amount: number, categoryId = c): ExpenseV2 => ({
    ...base,
    id: crypto.randomUUID(),
    periodId: p,
    categoryId,
    amount,
    date: '2026-09-08',
    description: 'Synthetic',
    recurringOccurrenceId: null,
    affectsBalance: true,
    balanceEffectiveAt: now,
    source: 'receipt',
  })
  return { db, period, budgets, expenses, update, query, rows, expense }
}
it('golden, edit amount/category/date, tombstone and paid recurring expense preserve category calculations and source', async () => {
  const s = await setup()
  const entries = [s.expense(12000), s.expense(20000), s.expense(8000)]
  entries[2]!.recurringOccurrenceId = crypto.randomUUID()
  await Promise.all(entries.map((e) => s.expenses.create(e)))
  await s.expenses.create(s.expense(80000, other))
  const assert = async (spent: number) => {
    expect(await s.query.execute(s.period, '2026-09-08')).toMatchObject({
      totalBudget: 100000,
      spentCents: spent,
      budgetRemaining: 100000 - spent,
      spendingPace: { spentPercentage: spent / 1000 },
    })
    expect(
      (await s.rows.execute({ ownerId: 'guest', periodId: p })).find(
        (row) => row.categoryId === c,
      ),
    ).toMatchObject({ spentCents: spent, remainingCents: 100000 - spent })
  }
  await assert(40000)
  const changed = await s.update.execute(entries[1]!.id, {
    ...entries[1]!,
    amount: 25000,
  })
  expect(changed.source).toBe('receipt')
  await assert(45000)
  await s.expenses.delete(entries[0]!.id)
  await assert(33000)
  const moved = await s.update.execute(changed.id, {
    ...changed,
    categoryId: other,
  })
  await assert(8000)
  const returned = await s.update.execute(moved.id, { ...moved, categoryId: c })
  await assert(33000)
  const later = await s.update.execute(returned.id, {
    ...returned,
    date: '2026-10-01',
  })
  expect(later.periodId).toBe(next)
  expect(later.source).toBe('receipt')
  await assert(8000)
})
it('overspending and zero keep signed remaining, historical expenses still count', async () => {
  const s = await setup()
  await s.expenses.create({ ...s.expense(120000), affectsBalance: false })
  expect(await s.query.execute(s.period, '2026-09-08')).toMatchObject({
    spentCents: 120000,
    budgetRemaining: -20000,
    spendingPace: { spentPercentage: 120 },
  })
  await s.budgets.upsert({
    ...base,
    id: crypto.randomUUID(),
    periodId: p,
    categoryId: c,
    amount: 0,
  })
  expect(await s.query.execute(s.period, '2026-09-08')).toMatchObject({
    totalBudget: 0,
    spentCents: 120000,
    budgetRemaining: -120000,
    spendingPace: { pace: 'indeterminate' },
  })
})
