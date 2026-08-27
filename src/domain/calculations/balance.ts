import type {
  BalanceAnchor,
  Expense,
  ExpenseV2,
  Income,
  IncomeV2,
} from '@domain/entities'
import type { Instant, SignedMoneyCents } from '@domain/value-objects'

const isIncomeV2 = (income: Income): income is IncomeV2 => 'status' in income
const isExpenseV2 = (expense: Expense): expense is ExpenseV2 =>
  'affectsBalance' in expense

export const getIncomeBalanceEffectiveAt = (income: Income): Instant | null => {
  if (income.deletedAt !== null) return null
  if (!isIncomeV2(income)) return income.createdAt
  return income.status === 'received' &&
    income.affectsBalance &&
    income.balanceEffectiveAt !== null
    ? income.balanceEffectiveAt
    : null
}

export const getExpenseBalanceEffectiveAt = (
  expense: Expense,
): Instant | null => {
  if (expense.deletedAt !== null) return null
  if (!isExpenseV2(expense)) return expense.createdAt
  return expense.affectsBalance ? expense.balanceEffectiveAt : null
}

export const isExpenseBalanceEffectiveAfter = (
  expense: Expense,
  cutoff: Instant,
): boolean => {
  const effectiveAt = getExpenseBalanceEffectiveAt(expense)
  return effectiveAt !== null && effectiveAt > cutoff
}

export function findEarliestBalanceEffectiveAt(
  incomes: readonly Income[],
  expenses: readonly Expense[],
): Instant | null {
  let earliest: Instant | null = null
  for (const effectiveAt of [
    ...incomes.map(getIncomeBalanceEffectiveAt),
    ...expenses.map(getExpenseBalanceEffectiveAt),
  ]) {
    if (effectiveAt !== null && (earliest === null || effectiveAt < earliest))
      earliest = effectiveAt
  }
  return earliest
}

export function calculateCurrentBalance(
  anchor: BalanceAnchor | null,
  incomes: readonly Income[],
  expenses: readonly Expense[],
): SignedMoneyCents | null {
  if (anchor === null || anchor.deletedAt !== null) return null

  const receivedAfterAnchor = incomes
    .filter((income) => {
      const effectiveAt = getIncomeBalanceEffectiveAt(income)
      return effectiveAt !== null && effectiveAt > anchor.ledgerCutoffAt
    })
    .reduce((total, income) => total + income.amount, 0)
  const spentAfterAnchor = expenses
    .filter((expense) =>
      isExpenseBalanceEffectiveAfter(expense, anchor.ledgerCutoffAt),
    )
    .reduce((total, expense) => total + expense.amount, 0)

  return anchor.amount + receivedAfterAnchor - spentAfterAnchor
}
