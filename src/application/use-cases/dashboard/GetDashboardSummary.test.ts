import { describe, expect, it, vi } from 'vitest'
import type {
  CategoryBudget,
  Expense,
  Income,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
  IIncomeRepository,
  IRecurringPaymentOccurrenceRepository,
  IRecurringPaymentRepository,
} from '@domain/repositories'
import { GetDashboardSummary } from './GetDashboardSummary'

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

describe('GetDashboardSummary', () => {
  it('agrega movimientos, presupuestos y compromisos de los repositorios', async () => {
    const period: Period = {
      ...base,
      id: 'period',
      type: 'monthly',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    }
    const incomesData: Income[] = [
      {
        ...base,
        id: 'income',
        periodId: period.id,
        amount: 200_000,
        description: 'Sueldo',
        date: '2026-07-01',
      },
    ]
    const expensesData: Expense[] = [
      {
        ...base,
        id: 'expense-a',
        periodId: period.id,
        categoryId: 'a',
        amount: 40_000,
        description: 'A',
        date: '2026-07-05',
        recurringOccurrenceId: null,
      },
      {
        ...base,
        id: 'expense-b',
        periodId: period.id,
        categoryId: 'b',
        amount: 10_000,
        description: 'B',
        date: '2026-07-10',
        recurringOccurrenceId: null,
      },
    ]
    const budgetsData: CategoryBudget[] = [
      {
        ...base,
        id: 'budget-a',
        periodId: period.id,
        categoryId: 'a',
        amount: 100_000,
      },
      {
        ...base,
        id: 'budget-b',
        periodId: period.id,
        categoryId: 'b',
        amount: 30_000,
      },
    ]
    const paymentsData: RecurringPayment[] = [
      {
        ...base,
        id: 'payment',
        name: 'Internet',
        amount: 25_000,
        frequency: 'monthly',
        dueDate: '2026-07-12',
        endDate: null,
        categoryId: 'b',
        status: 'active',
      },
    ]
    const occurrencesData: RecurringPaymentOccurrence[] = [
      {
        ...base,
        id: 'pending',
        recurringPaymentId: 'payment',
        periodId: period.id,
        dueDate: '2026-07-12',
        status: 'pending',
        transactionId: null,
      },
      {
        ...base,
        id: 'paid',
        recurringPaymentId: 'payment',
        periodId: period.id,
        dueDate: '2026-07-01',
        status: 'paid',
        transactionId: 'expense-b',
      },
    ]
    const findIncomes = vi.fn().mockResolvedValue(incomesData)
    const findExpenses = vi.fn().mockResolvedValue(expensesData)
    const findBudgets = vi.fn().mockResolvedValue(budgetsData)
    const findOccurrences = vi.fn().mockResolvedValue(occurrencesData)
    const findPayments = vi.fn().mockResolvedValue(paymentsData)
    const summary = new GetDashboardSummary(
      repository<IIncomeRepository>({ findByPeriod: findIncomes }),
      repository<IExpenseRepository>({ findByPeriod: findExpenses }),
      repository<ICategoryBudgetRepository>({ findByPeriod: findBudgets }),
      repository<IRecurringPaymentOccurrenceRepository>({
        findByPeriod: findOccurrences,
      }),
      repository<IRecurringPaymentRepository>({ findAll: findPayments }),
    )

    const result = await summary.execute(period, '2026-07-15')

    expect(result).toMatchObject({
      currentBalance: 150_000,
      totalBudget: 130_000,
      budgetRemaining: 80_000,
      pendingCommitments: 25_000,
      realAvailableMoney: 125_000,
      spendingPace: { pace: 'low' },
    })
    expect(findIncomes).toHaveBeenCalledWith(period.id)
    expect(findExpenses).toHaveBeenCalledWith(period.id)
    expect(findBudgets).toHaveBeenCalledWith(period.id)
    expect(findOccurrences).toHaveBeenCalledWith(period.id)
    expect(findPayments).toHaveBeenCalledOnce()
  })
})
