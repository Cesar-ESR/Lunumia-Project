import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import type { Category, CategoryBudget, Expense } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  ICategoryRepository,
  IExpenseRepository,
} from '@domain/repositories'
import { GetCategoryBudgetSummaries } from './GetCategoryBudgetSummaries'

const cents = fc.integer({ min: 0, max: 1_000_000 })
const base = {
  ownerId: 'owner',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced' as const,
}

describe('GetCategoryBudgetSummaries properties', () => {
  it('conserva budget - spent = remaining y permite resultados negativos', async () => {
    await fc.assert(
      fc.asyncProperty(cents, cents, async (budgetAmount, spentAmount) => {
        const budget: CategoryBudget = {
          ...base,
          id: 'budget',
          periodId: 'period',
          categoryId: 'category',
          amount: budgetAmount,
        }
        const expense: Expense = {
          ...base,
          id: 'expense',
          periodId: 'period',
          categoryId: 'category',
          amount: spentAmount,
          description: 'Gasto',
          date: '2026-08-10',
          recurringOccurrenceId: null,
        }
        const category: Category = {
          ...base,
          id: 'category',
          name: 'Category',
          normalizedName: 'category',
          color: '#000000',
          icon: null,
          isSystem: false,
        }
        const query = new GetCategoryBudgetSummaries(
          {
            findByPeriod: vi.fn().mockResolvedValue([budget]),
          } as unknown as ICategoryBudgetRepository,
          {
            findByPeriod: vi.fn().mockResolvedValue([expense]),
          } as unknown as IExpenseRepository,
          {
            findAll: vi.fn().mockResolvedValue([category]),
          } as unknown as ICategoryRepository,
        )

        const [summary] = await query.execute({
          ownerId: base.ownerId,
          periodId: 'period',
        })
        expect(summary?.spentCents).toBe(spentAmount)
        expect(summary?.remainingCents).toBe(budgetAmount - spentAmount)
        expect(summary?.status).toBe(
          budgetAmount - spentAmount < 0 ? 'over' : 'within',
        )
      }),
      { numRuns: 100 },
    )
  })
})
