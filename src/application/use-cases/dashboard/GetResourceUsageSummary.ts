import {
  calculateCurrentBalance,
  isExpenseBalanceEffectiveAfter,
} from '@domain/calculations'
import type { BalanceAnchor, Expense, Income } from '@domain/entities'
import type {
  AmountCents,
  Instant,
  SignedMoneyCents,
} from '@domain/value-objects'

export interface ResourceUsageSummary {
  referenceAt: Instant
  resourceBaseCents: SignedMoneyCents
  spentCents: AmountCents
  currentAvailableCents: SignedMoneyCents
  canCalculatePercentage: boolean
  status: 'available' | 'negative'
}

export function getResourceUsageSummary({
  anchor,
  incomes,
  expenses,
}: {
  anchor: BalanceAnchor | null
  incomes: readonly Income[]
  expenses: readonly Expense[]
}): ResourceUsageSummary | null {
  const currentAvailableCents = calculateCurrentBalance(
    anchor,
    incomes,
    expenses,
  )
  if (anchor === null || currentAvailableCents === null) return null

  const spentCents = expenses
    .filter((expense) =>
      isExpenseBalanceEffectiveAfter(expense, anchor.ledgerCutoffAt),
    )
    .reduce((total, expense) => total + expense.amount, 0)
  const resourceBaseCents = currentAvailableCents + spentCents

  return {
    referenceAt: anchor.ledgerCutoffAt,
    resourceBaseCents,
    spentCents,
    currentAvailableCents,
    canCalculatePercentage: resourceBaseCents > 0,
    status: currentAvailableCents < 0 ? 'negative' : 'available',
  }
}
