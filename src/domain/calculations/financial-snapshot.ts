import type {
  BalanceAnchor,
  Expense,
  Income,
  IncomeV2,
  Period,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

import { calculateCurrentBalance } from './balance'
import { calculateCommitments } from './commitments'

export type ProjectionCoverage = 'full_period' | 'overdue_only'

export interface FinancialSnapshot {
  openingBalanceCents: SignedMoneyCents | null
  currentBalanceCents: SignedMoneyCents | null
  spentCents: AmountCents
  committedCents: AmountCents
  upcomingCommittedCents: AmountCents
  overdueCommittedCents: AmountCents
  projectedAvailableCents: SignedMoneyCents | null
  expectedIncomeCents: AmountCents
  overdueExpectedIncomeCents: AmountCents
  projectedClosingBalanceCents: SignedMoneyCents | null
  projectionHorizonEnd: DateOnly | null
  projectionCoverage: ProjectionCoverage
}

export interface CalculateFinancialSnapshotInput {
  today: DateOnly
  currentPeriod: Period | null
  anchor: BalanceAnchor | null
  incomes: readonly Income[]
  expenses: readonly Expense[]
  occurrences: readonly RecurringPaymentOccurrence[]
}

const isIncomeV2 = (income: Income): income is IncomeV2 => 'status' in income

export function calculateFinancialSnapshot({
  today,
  currentPeriod,
  anchor,
  incomes,
  expenses,
  occurrences,
}: CalculateFinancialSnapshotInput): FinancialSnapshot {
  const activeCurrentPeriod =
    currentPeriod !== null && currentPeriod.deletedAt === null
      ? currentPeriod
      : null
  const projectionHorizonEnd = activeCurrentPeriod?.endDate ?? null
  const currentBalanceCents = calculateCurrentBalance(anchor, incomes, expenses)
  const spentCents = activeCurrentPeriod
    ? expenses
        .filter(
          (expense) =>
            expense.deletedAt === null &&
            expense.periodId === activeCurrentPeriod.id,
        )
        .reduce((total, expense) => total + expense.amount, 0)
    : 0
  const commitments = calculateCommitments(
    occurrences,
    today,
    projectionHorizonEnd,
  )
  let expectedIncomeCents = 0
  let overdueExpectedIncomeCents = 0

  for (const income of incomes) {
    if (
      income.deletedAt !== null ||
      !isIncomeV2(income) ||
      income.status !== 'expected'
    )
      continue
    if (income.date < today) {
      overdueExpectedIncomeCents += income.amount
      continue
    }
    if (
      activeCurrentPeriod !== null &&
      income.date <= activeCurrentPeriod.endDate
    )
      expectedIncomeCents += income.amount
  }

  return {
    openingBalanceCents:
      anchor === null || anchor.deletedAt !== null ? null : anchor.amount,
    currentBalanceCents,
    spentCents,
    ...commitments,
    projectedAvailableCents: currentBalanceCents - commitments.committedCents,
    expectedIncomeCents,
    overdueExpectedIncomeCents,
    projectedClosingBalanceCents:
      currentBalanceCents + expectedIncomeCents - commitments.committedCents,
    projectionHorizonEnd,
    projectionCoverage:
      activeCurrentPeriod === null ? 'overdue_only' : 'full_period',
  }
}
