import { computeSpendingPace, type SpendingPace } from '@domain/calculations'
import type { Period } from '@domain/entities'
import { assertUniqueActiveCategoryBudgets } from '@domain/rules/category-budget-uniqueness'
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
  spentCents: AmountCents
  budgetRemaining: SignedMoneyCents
  configuredBudgetCount: number
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
    const scopedBudgets = budgets.filter(
      (budget) =>
        budget.ownerId === period.ownerId &&
        budget.periodId === period.id &&
        budget.deletedAt === null,
    )
    assertUniqueActiveCategoryBudgets(scopedBudgets)
    const categoryIds = new Set(
      scopedBudgets.map((budget) => budget.categoryId),
    )
    const totalBudget = scopedBudgets.reduce(
      (total, budget) => total + budget.amount,
      0,
    )
    const totalSpent = expenses
      .filter(
        (expense) =>
          expense.ownerId === period.ownerId &&
          expense.periodId === period.id &&
          expense.deletedAt === null &&
          categoryIds.has(expense.categoryId),
      )
      .reduce((total, expense) => total + expense.amount, 0)

    return {
      totalBudget,
      spentCents: totalSpent,
      budgetRemaining: totalBudget - totalSpent,
      configuredBudgetCount: scopedBudgets.length,
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
