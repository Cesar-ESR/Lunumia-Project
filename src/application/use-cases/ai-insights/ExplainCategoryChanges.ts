import { computeCategoryChangePercentage } from '@domain/calculations'
import type { Category, Expense } from '@domain/entities'
import type {
  AIInsightsProvider,
  CalculatedCategoryChange,
  CategoryChangeExplanation,
} from '@domain/ports'
import type {
  ICategoryRepository,
  IExpenseRepository,
} from '@domain/repositories'

export const CATEGORY_CHANGE_LIMIT = 50

export function buildCalculatedCategoryChanges(
  currentExpenses: readonly Expense[],
  previousExpenses: readonly Expense[],
  categories: readonly Category[],
): ReadonlyArray<CalculatedCategoryChange> {
  return categories
    .filter((category) => category.deletedAt === null)
    .map((category) => {
      const currentAmount = sumCategory(currentExpenses, category.id)
      const previousAmount = sumCategory(previousExpenses, category.id)
      return {
        categoryId: category.id,
        categoryName: category.name,
        currentAmount,
        previousAmount,
        absoluteChange: currentAmount - previousAmount,
        changePercentage: computeCategoryChangePercentage(
          currentAmount,
          previousAmount,
        ),
      }
    })
    .filter(
      ({ currentAmount, previousAmount }) =>
        currentAmount > 0 || previousAmount > 0,
    )
    .sort(
      (left, right) =>
        Math.abs(right.absoluteChange) - Math.abs(left.absoluteChange) ||
        left.categoryId.localeCompare(right.categoryId),
    )
    .slice(0, CATEGORY_CHANGE_LIMIT)
}

export class ExplainCategoryChanges {
  constructor(private readonly provider: AIInsightsProvider) {}

  execute(
    changes: ReadonlyArray<CalculatedCategoryChange>,
  ): Promise<ReadonlyArray<CategoryChangeExplanation>> {
    return this.provider.explainCategoryChanges(changes)
  }
}

export class PrepareCategoryChanges {
  constructor(
    private readonly expenses: IExpenseRepository,
    private readonly categories: ICategoryRepository,
  ) {}

  async execute(
    currentPeriodId: string,
    previousPeriodId: string,
  ): Promise<ReadonlyArray<CalculatedCategoryChange>> {
    const [currentExpenses, previousExpenses, categories] = await Promise.all([
      this.expenses.findByPeriod(currentPeriodId),
      this.expenses.findByPeriod(previousPeriodId),
      this.categories.findAll(),
    ])
    return buildCalculatedCategoryChanges(
      currentExpenses,
      previousExpenses,
      categories,
    )
  }
}

function sumCategory(expenses: readonly Expense[], categoryId: string): number {
  return expenses
    .filter(
      (expense) =>
        expense.categoryId === categoryId && expense.deletedAt === null,
    )
    .reduce((total, expense) => total + expense.amount, 0)
}
