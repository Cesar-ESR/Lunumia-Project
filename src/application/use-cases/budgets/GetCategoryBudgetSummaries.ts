import { computeBudgetRemaining } from '@domain/calculations'
import type { Category, CategoryBudget, Expense } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  ICategoryRepository,
  IExpenseRepository,
} from '@domain/repositories'
import type { AmountCents, SignedMoneyCents } from '@domain/value-objects'

export type CategoryBudgetStatus = 'within' | 'over' | 'not_configured'

export interface CategoryBudgetSummary {
  categoryId: string
  budgetCents: AmountCents | null
  spentCents: AmountCents
  remainingCents: SignedMoneyCents | null
  status: CategoryBudgetStatus
}

export interface GetCategoryBudgetSummariesInput {
  ownerId: string
  periodId: string
}

const belongsToScope = (
  value: CategoryBudget | Expense,
  input: GetCategoryBudgetSummariesInput,
) =>
  value.ownerId === input.ownerId &&
  value.periodId === input.periodId &&
  value.deletedAt === null

const belongsToOwner = (category: Category, ownerId: string) =>
  category.ownerId === ownerId && category.deletedAt === null

export class GetCategoryBudgetSummaries {
  constructor(
    private readonly budgets: ICategoryBudgetRepository,
    private readonly expenses: IExpenseRepository,
    private readonly categories: ICategoryRepository,
  ) {}

  async execute(
    input: GetCategoryBudgetSummariesInput,
  ): Promise<CategoryBudgetSummary[]> {
    const [budgets, expenses, categories] = await Promise.all([
      this.budgets.findByPeriod(input.periodId),
      this.expenses.findByPeriod(input.periodId),
      this.categories.findAll(),
    ])
    const scopedExpenses = expenses.filter((expense) =>
      belongsToScope(expense, input),
    )

    const scopedBudgets = budgets.filter((budget) =>
      belongsToScope(budget, input),
    )

    return categories
      .filter((category) => belongsToOwner(category, input.ownerId))
      .map<CategoryBudgetSummary>((category) => {
        const budget = scopedBudgets.find(
          (value) => value.categoryId === category.id,
        )
        const categoryExpenses = scopedExpenses.filter(
          (expense) => expense.categoryId === category.id,
        )
        if (!budget) {
          return {
            categoryId: category.id,
            budgetCents: null,
            spentCents: categoryExpenses.reduce(
              (total, expense) => total + expense.amount,
              0,
            ),
            remainingCents: null,
            status: 'not_configured',
          }
        }
        const remainingCents = computeBudgetRemaining(budget, scopedExpenses)
        return {
          categoryId: category.id,
          budgetCents: budget.amount,
          spentCents: budget.amount - remainingCents,
          remainingCents,
          status: remainingCents < 0 ? 'over' : 'within',
        }
      })
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
  }
}
