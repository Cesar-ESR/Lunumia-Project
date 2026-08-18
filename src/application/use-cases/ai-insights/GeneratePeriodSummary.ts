import type { Category, Expense, Income, Period } from '@domain/entities'
import type {
  AIInsightsProvider,
  PeriodAggregatedData,
  PeriodSummary,
} from '@domain/ports'
import type {
  ICategoryRepository,
  IExpenseRepository,
  IIncomeRepository,
} from '@domain/repositories'

const TOP_EXPENSE_LIMIT = 10

export function buildPeriodAggregatedData(
  period: Period,
  incomes: readonly Income[],
  expenses: readonly Expense[],
  categories: readonly Category[],
): PeriodAggregatedData {
  const activeIncomes = incomes.filter(
    (income) =>
      income.ownerId === period.ownerId &&
      income.periodId === period.id &&
      income.deletedAt === null &&
      (!('status' in income) || income.status === 'received'),
  )
  const activeExpenses = expenses.filter(
    (expense) =>
      expense.ownerId === period.ownerId &&
      expense.periodId === period.id &&
      expense.deletedAt === null,
  )
  const totalIncome = activeIncomes.reduce(
    (total, income) => total + income.amount,
    0,
  )
  const totalExpenses = activeExpenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  )
  const categoryBreakdown = categories
    .filter(
      (category) =>
        category.ownerId === period.ownerId && category.deletedAt === null,
    )
    .map((category) => {
      const total = activeExpenses
        .filter((expense) => expense.categoryId === category.id)
        .reduce((sum, expense) => sum + expense.amount, 0)
      return {
        categoryId: category.id,
        categoryName: category.name,
        total,
        percentage: totalExpenses === 0 ? 0 : (total / totalExpenses) * 100,
      }
    })
    .filter(({ total }) => total > 0)
    .sort(
      (left, right) =>
        right.total - left.total ||
        left.categoryId.localeCompare(right.categoryId),
    )
    .slice(0, 50)
  const topExpenses = [...activeExpenses]
    .sort(
      (left, right) =>
        right.amount - left.amount || left.id.localeCompare(right.id),
    )
    .slice(0, TOP_EXPENSE_LIMIT)
    .map(({ description, amount }) => ({
      description: description.trim().slice(0, 200),
      amount,
    }))
    .filter(({ description }) => description.length > 0)
  return {
    totalIncome,
    totalExpenses,
    categoryBreakdown,
    topExpenses,
    periodType: period.type,
    startDate: period.startDate,
    endDate: period.endDate,
  }
}

export class GeneratePeriodSummary {
  constructor(private readonly provider: AIInsightsProvider) {}

  execute(aggregatedData: PeriodAggregatedData): Promise<PeriodSummary> {
    return this.provider.generatePeriodSummary(aggregatedData)
  }
}

export class PreparePeriodSummary {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly expenses: IExpenseRepository,
    private readonly categories: ICategoryRepository,
  ) {}

  async execute(period: Period): Promise<PeriodAggregatedData> {
    const [incomes, expenses, categories] = await Promise.all([
      this.incomes.findByPeriod(period.id),
      this.expenses.findByPeriod(period.id),
      this.categories.findAll(),
    ])
    return buildPeriodAggregatedData(period, incomes, expenses, categories)
  }
}
