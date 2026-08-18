import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinancialSnapshot } from '@domain/calculations'
import type { CategoryBudget, Period } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
} from '@domain/repositories'
import { SimulatePurchase } from './SimulatePurchase'

const period: Period = {
  id: 'period',
  ownerId: 'owner',
  type: 'monthly',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
}

const snapshot = (
  overrides: Partial<FinancialSnapshot> = {},
): FinancialSnapshot => ({
  currentBalanceCents: 10_000,
  spentCents: 0,
  committedCents: 4_000,
  upcomingCommittedCents: 4_000,
  overdueCommittedCents: 0,
  projectedAvailableCents: 6_000,
  expectedIncomeCents: 9_000,
  overdueExpectedIncomeCents: 0,
  projectedClosingBalanceCents: 15_000,
  projectionHorizonEnd: period.endDate,
  projectionCoverage: 'full_period',
  ...overrides,
})

const budget = (amount: number): CategoryBudget => ({
  id: 'budget',
  ownerId: 'owner',
  periodId: period.id,
  categoryId: 'category',
  amount,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
})

function repository<T extends object>(implementation: Partial<T>): T {
  return implementation as T
}

describe('SimulatePurchase', () => {
  const financialExecute = vi.fn()
  const findBudget = vi.fn()
  const findExpenses = vi.fn()
  const budgetUpsert = vi.fn()
  const budgetDelete = vi.fn()
  const expenseCreate = vi.fn()
  const expenseUpdate = vi.fn()
  const expenseDelete = vi.fn()

  const createUseCase = () =>
    new SimulatePurchase(
      { execute: financialExecute },
      repository<ICategoryBudgetRepository>({
        findByPeriodAndCategory: findBudget,
        upsert: budgetUpsert,
        delete: budgetDelete,
      }),
      repository<IExpenseRepository>({
        findByPeriod: findExpenses,
        create: expenseCreate,
        update: expenseUpdate,
        delete: expenseDelete,
      }),
    )

  beforeEach(() => {
    vi.clearAllMocks()
    financialExecute.mockResolvedValue(snapshot())
    findBudget.mockResolvedValue(budget(10_000))
    findExpenses.mockResolvedValue([])
  })

  it('usa projectedAvailable del snapshot sin restar committed ni sumar expected otra vez', async () => {
    const source = snapshot()
    const before = structuredClone(source)
    financialExecute.mockResolvedValue(source)

    const result = await createUseCase().execute({
      period,
      categoryId: 'category',
      amount: 6_500,
    })

    expect(result).toMatchObject({
      projectedAvailableBeforePurchase: 6_000,
      projectedAvailableAfterPurchase: -500,
      financialAffordability: 'exceeds',
    })
    expect(source).toEqual(before)
  })

  it('representa saldo desconocido sin convertirlo a cero y conserva presupuesto', async () => {
    financialExecute.mockResolvedValue(
      snapshot({
        currentBalanceCents: null,
        projectedAvailableCents: null,
        projectedClosingBalanceCents: null,
      }),
    )
    findBudget.mockResolvedValue(budget(5_000))

    const result = await createUseCase().execute({
      period,
      categoryId: 'category',
      amount: 1_000,
    })

    expect(result).toMatchObject({
      projectedAvailableBeforePurchase: null,
      projectedAvailableAfterPurchase: null,
      financialAffordability: 'unknown',
      categoryBudgetBefore: 5_000,
      categoryBudgetAfter: 4_000,
      budgetFit: 'within',
    })
  })

  it.each([
    {
      available: 100,
      budgetRemaining: 100,
      financial: 'within',
      budget: 'within',
    },
    {
      available: 100,
      budgetRemaining: 40,
      financial: 'within',
      budget: 'exceeds',
    },
    {
      available: 40,
      budgetRemaining: 100,
      financial: 'exceeds',
      budget: 'within',
    },
    {
      available: 40,
      budgetRemaining: 40,
      financial: 'exceeds',
      budget: 'exceeds',
    },
  ] as const)(
    'mantiene independientes affordability=$financial y budget=$budget',
    async ({ available, budgetRemaining, financial, budget: budgetFit }) => {
      financialExecute.mockResolvedValue(
        snapshot({ projectedAvailableCents: available }),
      )
      findBudget.mockResolvedValue(budget(budgetRemaining))

      const result = await createUseCase().execute({
        period,
        categoryId: 'category',
        amount: 50,
      })

      expect(result.financialAffordability).toBe(financial)
      expect(result.budgetFit).toBe(budgetFit)
    },
  )

  it('trata la igualdad exacta como dentro del límite y conserva cero', async () => {
    financialExecute.mockResolvedValue(
      snapshot({ projectedAvailableCents: 1_000 }),
    )
    findBudget.mockResolvedValue(budget(1_000))

    const result = await createUseCase().execute({
      period,
      categoryId: 'category',
      amount: 1_000,
    })

    expect(result.projectedAvailableAfterPurchase).toBe(0)
    expect(result.financialAffordability).toBe('within')
    expect(result.categoryBudgetAfter).toBe(0)
    expect(result.budgetFit).toBe('within')
  })

  it('conserva resultados negativos previos sin clamp', async () => {
    financialExecute.mockResolvedValue(
      snapshot({ projectedAvailableCents: -1_000 }),
    )

    const result = await createUseCase().execute({
      period,
      categoryId: 'category',
      amount: 500,
    })

    expect(result.projectedAvailableAfterPurchase).toBe(-1_500)
    expect(result.financialAffordability).toBe('exceeds')
  })

  it('propaga coverage overdue_only sin inventar horizonte', async () => {
    financialExecute.mockResolvedValue(
      snapshot({
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: null,
      }),
    )

    const result = await createUseCase().execute({
      period,
      categoryId: 'category',
      amount: 500,
    })

    expect(result.projectionCoverage).toBe('overdue_only')
    expect(result.projectionHorizonEnd).toBeNull()
  })

  it('representa la ausencia de presupuesto independientemente del snapshot', async () => {
    findBudget.mockResolvedValue(null)

    const result = await createUseCase().execute({
      period,
      categoryId: 'category',
      amount: 500,
    })

    expect(result.categoryBudgetBefore).toBeNull()
    expect(result.categoryBudgetAfter).toBeNull()
    expect(result.budgetFit).toBe('not_configured')
    expect(result.financialAffordability).toBe('within')
  })

  it('es determinista, no muta inputs y nunca invoca mutations', async () => {
    const input = { period, categoryId: 'category', amount: 500 as const }
    const inputBefore = structuredClone(input)
    const useCase = createUseCase()

    const results = await Promise.all([
      useCase.execute(input),
      useCase.execute(input),
      useCase.execute(input),
    ])

    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
    expect(input).toEqual(inputBefore)
    expect(budgetUpsert).not.toHaveBeenCalled()
    expect(budgetDelete).not.toHaveBeenCalled()
    expect(expenseCreate).not.toHaveBeenCalled()
    expect(expenseUpdate).not.toHaveBeenCalled()
    expect(expenseDelete).not.toHaveBeenCalled()
  })
})
