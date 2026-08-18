import type { CategoryBudget, Expense } from '@domain/entities'
import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

export type {
  CalculateFinancialSnapshotInput,
  FinancialSnapshot,
  ProjectionCoverage,
} from './financial-snapshot'
export { calculateFinancialSnapshot } from './financial-snapshot'
export type {
  CalculatePlanningProjectionInput,
  PlanningProjection,
} from './planning-projection'
export { calculatePlanningProjection } from './planning-projection'
export type {
  ProjectedRecurringPayment,
  ProjectRecurringPaymentsForRangeInput,
} from './recurring-projection'
export { projectRecurringPaymentsForRange } from './recurring-projection'
export { calculateCurrentBalance } from './balance'
export type { CommitmentTotals } from './commitments'
export { calculateCommitments } from './commitments'
export type {
  BudgetFit,
  FinancialAffordability,
  SimulationResult,
} from './simulator'
export { simulatePurchaseImpact } from './simulator'

const sum = (values: readonly { amount: AmountCents }[]): number =>
  values.reduce((total, value) => total + value.amount, 0)
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
export const computeCategoryChangePercentage = (
  current: AmountCents,
  previous: AmountCents,
): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100
