import {
  computeBudgetRemaining,
  computeSpendingPace,
  type SpendingPace,
} from '@domain/calculations'
import type { Period } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
} from '@domain/repositories'
import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

export interface DashboardBudgetSummary {
  totalBudget: AmountCents
  budgetRemaining: SignedMoneyCents
  spendingPace: SpendingPace
}

export class GetDashboardBudgetSummary {
  constructor(
    private readonly budgets: ICategoryBudgetRepository,
    private readonly expenses: IExpenseRepository,
  ) {}

  async execute(
    period: Period,
    today: DateOnly,
  ): Promise<DashboardBudgetSummary> {
    const [budgets, expenses] = await Promise.all([
      this.budgets.findByPeriod(period.id),
      this.expenses.findByPeriod(period.id),
    ])
    const totalBudget = budgets.reduce(
      (total, budget) => total + budget.amount,
      0,
    )
    const budgetRemaining = budgets.reduce(
      (total, budget) => total + computeBudgetRemaining(budget, expenses),
      0,
    )
    const totalSpent = expenses.reduce(
      (total, expense) => total + expense.amount,
      0,
    )

    return {
      totalBudget,
      budgetRemaining,
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
