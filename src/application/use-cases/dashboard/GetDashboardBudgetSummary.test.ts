import { describe, expect, it, vi } from 'vitest'
import type { CategoryBudget, Expense, Period } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
} from '@domain/repositories'
import { GetDashboardBudgetSummary } from './GetDashboardBudgetSummary'

const base = {
  ownerId: 'owner',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced' as const,
}

function repository<T extends object>(implementation: Partial<T>): T {
  return implementation as T
}

describe('GetDashboardBudgetSummary', () => {
  it('conserva únicamente las métricas específicas de presupuesto y ritmo', async () => {
    const period: Period = {
      ...base,
      id: 'period',
      type: 'monthly',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    }
    const budgets: CategoryBudget[] = [
      {
        ...base,
        id: 'budget',
        periodId: period.id,
        categoryId: 'food',
        amount: 100_000,
      },
    ]
    const expenses: Expense[] = [
      {
        ...base,
        id: 'expense',
        periodId: period.id,
        categoryId: 'food',
        amount: 25_000,
        description: 'Comida',
        date: '2026-07-10',
        recurringOccurrenceId: null,
      },
    ]
    const getSummary = new GetDashboardBudgetSummary(
      repository<ICategoryBudgetRepository>({
        findByPeriod: vi.fn().mockResolvedValue(budgets),
      }),
      repository<IExpenseRepository>({
        findByPeriod: vi.fn().mockResolvedValue(expenses),
      }),
    )

    await expect(getSummary.execute(period, '2026-07-15')).resolves.toEqual({
      totalBudget: 100_000,
      spentCents: 25_000,
      budgetRemaining: 75_000,
      configuredBudgetCount: 1,
      spendingPace: {
        spentPercentage: 25,
        timePercentage: 46.666666666666664,
        pace: 'low',
      },
    })
  })

  it('distingue ausencia de presupuesto de una configuración explícita en cero', async () => {
    const period: Period = {
      ...base,
      id: 'period',
      type: 'monthly',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    }
    const findBudgets = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...base,
          id: 'zero-budget',
          periodId: period.id,
          categoryId: 'food',
          amount: 0,
        },
      ])
    const getSummary = new GetDashboardBudgetSummary(
      repository<ICategoryBudgetRepository>({ findByPeriod: findBudgets }),
      repository<IExpenseRepository>({
        findByPeriod: vi.fn().mockResolvedValue([]),
      }),
    )

    await expect(
      getSummary.execute(period, '2026-07-15'),
    ).resolves.toMatchObject({
      totalBudget: 0,
      spentCents: 0,
      budgetRemaining: 0,
      configuredBudgetCount: 0,
    })
    await expect(
      getSummary.execute(period, '2026-07-15'),
    ).resolves.toMatchObject({
      totalBudget: 0,
      spentCents: 0,
      budgetRemaining: 0,
      configuredBudgetCount: 1,
    })
  })
})
