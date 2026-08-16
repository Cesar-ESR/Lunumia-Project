import type { AmountCents, SignedMoneyCents } from '@domain/value-objects'

export interface PlanningProjection {
  periodId: string
  projectedOpeningBalanceCents: SignedMoneyCents | null
  expectedIncomeCents: AmountCents
  projectedRecurringPaymentsCents: AmountCents
  projectedClosingBalanceCents: SignedMoneyCents | null
}
