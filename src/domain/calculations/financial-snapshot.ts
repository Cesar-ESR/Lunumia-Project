import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

export type ProjectionCoverage = 'full_period' | 'overdue_only'

export interface FinancialSnapshot {
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
