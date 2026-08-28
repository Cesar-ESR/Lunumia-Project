import type {
  ExplainChangesInput,
  PeriodSummaryInput,
  PlanningAnalysisInput,
} from '../contracts.ts'

const AI_CURRENCY = 'MXN'
const AI_MONEY_LOCALE = 'es-MX'
const moneyFormatter = new Intl.NumberFormat(AI_MONEY_LOCALE, {
  style: 'currency',
  currency: AI_CURRENCY,
})

export function buildPeriodSummaryPromptContext(input: PeriodSummaryInput) {
  const data = input.facts
  return {
    context: input.context,
    receivedIncome: formatCurrency(data.receivedIncomeCents),
    expenses: formatCurrency(data.expenseCents),
    categoryBreakdown: data.categoryBreakdown.map((category) => ({
      categoryName: category.categoryName,
      total: formatCurrency(category.totalCents),
      percentage: formatPercentage(category.percentage),
    })),
    topExpenses: data.topExpenses?.map((expense) => ({
      description: expense.description,
      amount: formatCurrency(expense.amountCents),
    })),
    periodType: data.periodType,
    startDate: data.startDate,
    endDate: data.endDate,
  }
}

export function buildPlanningPromptContext(input: PlanningAnalysisInput) {
  const facts = input.facts
  return {
    context: input.context,
    facts: {
      currentBalance: formatNullablePlanningCurrency(facts.currentBalanceCents),
      committed: formatPlanningCurrency(facts.committedCents),
      expectedIncome: formatPlanningCurrency(facts.expectedIncomeCents),
      projectedAvailable: formatNullablePlanningCurrency(
        facts.projectedAvailableCents,
      ),
      projectedClosingBalance: formatNullablePlanningCurrency(
        facts.projectedClosingBalanceCents,
      ),
      projectionCoverage: facts.projectionCoverage,
      projectionHorizonEnd: facts.projectionHorizonEnd,
    },
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

function formatPlanningCurrency(amountCents: number): string {
  return `${formatCurrency(amountCents)} ${AI_CURRENCY}`
}

function formatNullablePlanningCurrency(
  amountCents: number | null,
): string | null {
  return amountCents === null ? null : formatPlanningCurrency(amountCents)
}

function formatPercentage(value: number, showPositiveSign = false): string {
  const sign = showPositiveSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}
