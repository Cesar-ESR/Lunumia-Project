import {
  computeBudgetRemaining,
  computeCurrentBalance,
  computePendingCommitments,
  computeRealAvailableMoney,
  computeSpendingPace,
  type SpendingPace,
} from '@domain/calculations'
import type { Period } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
  IIncomeRepository,
  IRecurringPaymentOccurrenceRepository,
  IRecurringPaymentRepository,
} from '@domain/repositories'
import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

export interface DashboardSummary {
  currentBalance: SignedMoneyCents
  totalBudget: AmountCents
  budgetRemaining: SignedMoneyCents
  pendingCommitments: AmountCents
  realAvailableMoney: SignedMoneyCents
  spendingPace: SpendingPace
}

export class GetDashboardSummary {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly expenses: IExpenseRepository,
    private readonly budgets: ICategoryBudgetRepository,
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
    private readonly payments: IRecurringPaymentRepository,
  ) {}
  async execute(period: Period, today: DateOnly): Promise<DashboardSummary> {
    const [incomes, expenses, budgets, occurrences, payments] =
      await Promise.all([
        this.incomes.findByPeriod(period.id),
        this.expenses.findByPeriod(period.id),
        this.budgets.findByPeriod(period.id),
        this.occurrences.findByPeriod(period.id),
        this.payments.findAll(),
      ])
    const currentBalance = computeCurrentBalance(incomes, expenses)
    const totalBudget = budgets.reduce(
      (total, budget) => total + budget.amount,
      0,
    )
    const budgetRemaining = budgets.reduce(
      (total, budget) => total + computeBudgetRemaining(budget, expenses),
      0,
    )
    const pendingCommitments = computePendingCommitments(
      occurrences,
      payments,
      period.id,
    )
    const realAvailableMoney = computeRealAvailableMoney(
      incomes,
      expenses,
      pendingCommitments,
    )
    const totalSpent = expenses.reduce(
      (total, expense) => total + expense.amount,
      0,
    )
    return {
      currentBalance,
      totalBudget,
      budgetRemaining,
      pendingCommitments,
      realAvailableMoney,
      spendingPace: computeSpendingPace(
        totalBudget,
        totalSpent,
        period.startDate,
        period.endDate,
        today,
      ),
    }
  }
}
