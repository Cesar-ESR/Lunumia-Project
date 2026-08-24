import { describe, expect, it, vi } from 'vitest'
import type {
  Category,
  CategoryBudget,
  Expense,
  ExpenseV2,
  Period,
} from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  ICategoryRepository,
  IExpenseRepository,
} from '@domain/repositories'
import { GetDashboardBudgetSummary } from '../dashboard/GetDashboardBudgetSummary'
import { GetCategoryBudgetSummaries } from './GetCategoryBudgetSummaries'

const OWNER_ID = 'owner-a'
const PERIOD_ID = 'period-a'
const NOW = '2026-08-01T00:00:00.000Z'
const base = {
  ownerId: OWNER_ID,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  syncStatus: 'synced' as const,
}

const budget = (
  categoryId: string,
  amount: number,
  overrides: Partial<CategoryBudget> = {},
): CategoryBudget => ({
  ...base,
  id: `budget-${categoryId}`,
  periodId: PERIOD_ID,
  categoryId,
  amount,
  ...overrides,
})

const category = (id: string, overrides: Partial<Category> = {}): Category => ({
  ...base,
  id,
  name: id,
  normalizedName: id,
  color: '#000000',
  icon: null,
  isSystem: false,
  ...overrides,
})

const expense = (
  categoryId: string,
  amount: number,
  overrides: Partial<Expense> = {},
): Expense => ({
  ...base,
  id: `expense-${categoryId}-${amount}`,
  periodId: PERIOD_ID,
  categoryId,
  amount,
  description: 'Gasto',
  date: '2026-08-10',
  recurringOccurrenceId: null,
  ...overrides,
})

function setup(
  budgets: CategoryBudget[],
  expenses: Expense[],
  categories: Category[] = [
    ...new Set([
      ...budgets.map(({ categoryId }) => categoryId),
      ...expenses.map(({ categoryId }) => categoryId),
    ]),
  ].map((id) => category(id)),
) {
  const budgetRepository = {
    findByPeriod: vi.fn().mockResolvedValue(budgets),
  } as unknown as ICategoryBudgetRepository
  const expenseRepository = {
    findByPeriod: vi.fn().mockResolvedValue(expenses),
  } as unknown as IExpenseRepository
  const categoryRepository = {
    findAll: vi.fn().mockResolvedValue(categories),
  } as unknown as ICategoryRepository
  return {
    budgetRepository,
    expenseRepository,
    categoryRepository,
    query: new GetCategoryBudgetSummaries(
      budgetRepository,
      expenseRepository,
      categoryRepository,
    ),
  }
}

describe('GetCategoryBudgetSummaries', () => {
  it('expone budget, spent, remaining y status para una categoría', async () => {
    const { query, budgetRepository, expenseRepository, categoryRepository } =
      setup([budget('food', 100_000)], [expense('food', 80_000)])

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      {
        categoryId: 'food',
        budgetCents: 100_000,
        spentCents: 80_000,
        remainingCents: 20_000,
        status: 'within',
      },
    ])
    expect(budgetRepository.findByPeriod).toHaveBeenCalledOnce()
    expect(expenseRepository.findByPeriod).toHaveBeenCalledOnce()
    expect(categoryRepository.findAll).toHaveBeenCalledOnce()
  })

  it('preserva remaining negativo y status over sin clamp', async () => {
    const { query } = setup(
      [budget('food', 100_000)],
      [expense('food', 115_000)],
    )

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      expect.objectContaining({
        spentCents: 115_000,
        remainingCents: -15_000,
        status: 'over',
      }),
    ])
  })

  it('mantiene un presupuesto cero configurado y permite remaining negativo', async () => {
    const { query } = setup([budget('food', 0)], [expense('food', 1)])

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      expect.objectContaining({
        budgetCents: 0,
        spentCents: 1,
        remainingCents: -1,
        status: 'over',
      }),
    ])
  })

  it('representa una categoría sin presupuesto sin convertirla en cero', async () => {
    const { query } = setup([], [expense('food', 80_000)])

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      {
        categoryId: 'food',
        budgetCents: null,
        spentCents: 80_000,
        remainingCents: null,
        status: 'not_configured',
      },
    ])
  })

  it('aísla múltiples categorías y devuelve un orden determinista', async () => {
    const { query } = setup(
      [
        budget('transport', 50_000),
        budget('other', 30_000),
        budget('food', 100_000),
      ],
      [
        expense('food', 80_000),
        expense('transport', 20_000),
        expense('other', 35_000),
      ],
    )

    const result = await query.execute({
      ownerId: OWNER_ID,
      periodId: PERIOD_ID,
    })
    expect(result.map(({ categoryId }) => categoryId)).toEqual([
      'food',
      'other',
      'transport',
    ])
    expect(result.map(({ remainingCents }) => remainingCents)).toEqual([
      20_000, -5_000, 30_000,
    ])
  })

  it('impide fugas de owner, periodo y tombstones aun ante una fuente contaminada', async () => {
    const { query } = setup(
      [
        budget('food', 100_000),
        budget('foreign-owner', 100_000, { ownerId: 'owner-b' }),
        budget('foreign-period', 100_000, { periodId: 'period-b' }),
        budget('deleted', 100_000, { deletedAt: NOW }),
      ],
      [
        expense('food', 10_000),
        expense('food', 70_000, { ownerId: 'owner-b' }),
        expense('food', 60_000, { periodId: 'period-b' }),
        expense('food', 50_000, { deletedAt: NOW }),
      ],
      [category('food'), category('foreign', { ownerId: 'owner-b' })],
    )

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      expect.objectContaining({
        categoryId: 'food',
        spentCents: 10_000,
        remainingCents: 90_000,
      }),
    ])
  })

  it('cuenta gastos históricos aunque no afecten el saldo', async () => {
    const historical: ExpenseV2 = {
      ...expense('food', 25_000),
      affectsBalance: false,
      balanceEffectiveAt: NOW,
    }
    const { query } = setup([budget('food', 100_000)], [historical])

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      expect.objectContaining({
        spentCents: 25_000,
        remainingCents: 75_000,
      }),
    ])
  })

  it('cuenta una transacción vinculada a recurrencia exactamente una vez', async () => {
    const { query } = setup(
      [budget('services', 100_000)],
      [
        expense('services', 40_000, {
          recurringOccurrenceId: 'occurrence-a',
        }),
      ],
    )

    await expect(
      query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
    ).resolves.toEqual([
      expect.objectContaining({
        spentCents: 40_000,
        remainingCents: 60_000,
      }),
    ])
  })

  it('conserva los agregados públicos de GetDashboardBudgetSummary', async () => {
    const period: Period = {
      ...base,
      id: PERIOD_ID,
      type: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    }
    const context = setup(
      [budget('food', 100_000), budget('transport', 50_000)],
      [expense('food', 80_000), expense('transport', 20_000)],
    )
    const dashboard = new GetDashboardBudgetSummary(
      context.budgetRepository,
      context.expenseRepository,
    )

    const [categories, aggregate] = await Promise.all([
      context.query.execute({ ownerId: OWNER_ID, periodId: PERIOD_ID }),
      dashboard.execute(period, '2026-08-15'),
    ])
    expect(
      categories.reduce((total, value) => total + (value.budgetCents ?? 0), 0),
    ).toBe(aggregate.totalBudget)
    expect(
      categories.reduce(
        (total, value) => total + (value.remainingCents ?? 0),
        0,
      ),
    ).toBe(aggregate.budgetRemaining)
  })
})
