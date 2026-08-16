import type {
  CategoryBudget,
  Expense,
  Income,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

export type {
  FinancialSnapshot,
  ProjectionCoverage,
} from './financial-snapshot'
export type { PlanningProjection } from './planning-projection'

const sum = (values: readonly { amount: AmountCents }[]): number =>
  values.reduce((total, value) => total + value.amount, 0)
export const computeCurrentBalance = (
  incomes: readonly Income[],
  expenses: readonly Expense[],
): SignedMoneyCents => sum(incomes) - sum(expenses)
export const computeBudgetRemaining = (
  budget: CategoryBudget,
  expenses: readonly Expense[],
): SignedMoneyCents =>
  budget.amount -
  sum(
    expenses.filter(
      (expense) =>
        expense.categoryId === budget.categoryId &&
        expense.periodId === budget.periodId &&
        expense.deletedAt === null,
    ),
  )
export const computeBudgetUsagePercentage = (
  budget: CategoryBudget,
  expenses: readonly Expense[],
): number | null =>
  budget.amount === 0
    ? null
    : (sum(
        expenses.filter(
          (expense) =>
            expense.categoryId === budget.categoryId &&
            expense.periodId === budget.periodId &&
            expense.deletedAt === null,
        ),
      ) /
        budget.amount) *
      100
export const computePendingCommitments = (
  occurrences: readonly RecurringPaymentOccurrence[],
  payments: readonly RecurringPayment[],
  periodId: string,
): AmountCents =>
  occurrences
    .filter(
      (occurrence) =>
        occurrence.periodId === periodId &&
        occurrence.status === 'pending' &&
        occurrence.deletedAt === null,
    )
    .reduce(
      (total, occurrence) =>
        total +
        (payments.find(
          (payment) => payment.id === occurrence.recurringPaymentId,
        )?.amount ?? 0),
      0,
    )
export const computeRealAvailableMoney = (
  incomes: readonly Income[],
  expenses: readonly Expense[],
  pending: AmountCents,
): SignedMoneyCents => computeCurrentBalance(incomes, expenses) - pending
export interface SpendingPace {
  spentPercentage: number
  timePercentage: number
  pace: 'low' | 'adequate' | 'high' | 'indeterminate'
}
export function computeSpendingPace(
  totalBudget: AmountCents,
  totalSpent: AmountCents,
  start: DateOnly,
  end: DateOnly,
  today: DateOnly,
): SpendingPace {
  if (totalBudget === 0)
    return { spentPercentage: 0, timePercentage: 0, pace: 'indeterminate' }
  const duration =
    Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  const elapsed =
    Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  const timePercentage = Math.max(
    0,
    Math.min(100, duration <= 0 ? 100 : (elapsed / duration) * 100),
  )
  const spentPercentage = (totalSpent / totalBudget) * 100
  return {
    spentPercentage,
    timePercentage,
    pace:
      spentPercentage > timePercentage + 10
        ? 'high'
        : spentPercentage < timePercentage
          ? 'low'
          : 'adequate',
  }
}
export interface SimulationResult {
  currentAvailable: SignedMoneyCents
  afterPurchaseAvailable: SignedMoneyCents
  categoryBudgetRemaining: SignedMoneyCents
  isNegative: boolean
}
export const simulatePurchaseImpact = (
  currentAvailable: SignedMoneyCents,
  purchaseAmount: AmountCents,
  categoryBudgetRemaining: SignedMoneyCents,
): SimulationResult => ({
  currentAvailable,
  afterPurchaseAvailable: currentAvailable - purchaseAmount,
  categoryBudgetRemaining: categoryBudgetRemaining - purchaseAmount,
  isNegative: currentAvailable - purchaseAmount < 0,
})
export const computeCategoryChangePercentage = (
  current: AmountCents,
  previous: AmountCents,
): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100
