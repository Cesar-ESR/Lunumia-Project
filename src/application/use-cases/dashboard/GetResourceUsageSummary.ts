import {
  calculateCurrentBalance,
  getExpenseBalanceEffectiveAt,
} from '@domain/calculations'
import type { BalanceAnchor, Expense, Income } from '@domain/entities'
import type {
  AmountCents,
  Instant,
  SignedMoneyCents,
} from '@domain/value-objects'

export interface ResourceUsageSummary {
  referenceAt: Instant | null
  hasOpeningBalance: boolean
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
}): ResourceUsageSummary {
  const currentAvailableCents = calculateCurrentBalance(
    anchor,
    incomes,
    expenses,
  )
  const spentCents = expenses
    .filter((expense) => getExpenseBalanceEffectiveAt(expense) !== null)
    .reduce((total, expense) => total + expense.amount, 0)
  const resourceBaseCents = currentAvailableCents + spentCents
  const activeAnchor =
    anchor !== null && anchor.deletedAt === null ? anchor : null

  return {
    referenceAt: activeAnchor?.capturedAt ?? null,
    hasOpeningBalance: activeAnchor !== null,
    resourceBaseCents,
    spentCents,
    currentAvailableCents,
    canCalculatePercentage: resourceBaseCents > 0,
    status: currentAvailableCents < 0 ? 'negative' : 'available',
  }
}
