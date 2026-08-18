import type {
  BalanceAnchor,
  Expense,
  ExpenseV2,
  Income,
  IncomeV2,
} from '@domain/entities'
import type { SignedMoneyCents } from '@domain/value-objects'

const isIncomeV2 = (income: Income): income is IncomeV2 => 'status' in income
const isExpenseV2 = (expense: Expense): expense is ExpenseV2 =>
  'affectsBalance' in expense

const incomeEffectiveAfter = (income: Income, cutoff: string): boolean => {
  if (!isIncomeV2(income)) return income.createdAt > cutoff
  return (
    income.status === 'received' &&
    income.affectsBalance &&
    income.balanceEffectiveAt !== null &&
    income.balanceEffectiveAt > cutoff
  )
}

const expenseEffectiveAfter = (expense: Expense, cutoff: string): boolean => {
  if (!isExpenseV2(expense)) return expense.createdAt > cutoff
  return expense.affectsBalance && expense.balanceEffectiveAt > cutoff
}

export function calculateCurrentBalance(
  anchor: BalanceAnchor | null,
  incomes: readonly Income[],
  expenses: readonly Expense[],
): SignedMoneyCents | null {
  if (anchor === null || anchor.deletedAt !== null) return null

  const receivedAfterAnchor = incomes
    .filter(
      (income) =>
        income.deletedAt === null &&
        incomeEffectiveAfter(income, anchor.ledgerCutoffAt),
    )
    .reduce((total, income) => total + income.amount, 0)
  const spentAfterAnchor = expenses
    .filter(
      (expense) =>
        expense.deletedAt === null &&
        expenseEffectiveAfter(expense, anchor.ledgerCutoffAt),
    )
    .reduce((total, expense) => total + expense.amount, 0)

  return anchor.amount + receivedAfterAnchor - spentAfterAnchor
}
