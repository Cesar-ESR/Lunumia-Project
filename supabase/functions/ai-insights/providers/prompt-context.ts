import type { ExplainChangesInput, PeriodSummaryInput } from '../contracts.ts'

const AI_CURRENCY = 'MXN'
const AI_MONEY_LOCALE = 'es-MX'
const moneyFormatter = new Intl.NumberFormat(AI_MONEY_LOCALE, {
  style: 'currency',
  currency: AI_CURRENCY,
})

export function buildPeriodSummaryPromptContext(input: PeriodSummaryInput) {
  const data = input.aggregatedData
  return {
    totalIncome: formatCurrency(data.totalIncome),
    totalExpenses: formatCurrency(data.totalExpenses),
    categoryBreakdown: data.categoryBreakdown.map((category) => ({
      categoryName: category.categoryName,
      total: formatCurrency(category.total),
      percentage: formatPercentage(category.percentage),
    })),
    topExpenses: data.topExpenses?.map((expense) => ({
      description: expense.description,
      amount: formatCurrency(expense.amount),
    })),
    periodType: data.periodType,
    startDate: data.startDate,
    endDate: data.endDate,
  }
}

export function buildExplainChangesPromptContext(input: ExplainChangesInput) {
  return {
    changes: input.changes.map((change) => ({
      categoryId: change.categoryId,
      categoryName: change.categoryName,
      currentAmount: formatCurrency(change.currentAmount),
      previousAmount: formatCurrency(change.previousAmount),
      changePercentage:
        change.changePercentage === null
          ? 'Sin referencia anterior'
          : formatPercentage(change.changePercentage, true),
      absoluteChange: formatCurrency(change.absoluteChange),
    })),
  }
}

export function formatCurrency(amountCents: number): string {
  return moneyFormatter.format(amountCents / 100)
}

function formatPercentage(value: number, showPositiveSign = false): string {
  const sign = showPositiveSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}
