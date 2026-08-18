import type {
  Income,
  IncomeV2,
  Period,
  RecurringPayment,
} from '@domain/entities'
import type { AmountCents, SignedMoneyCents } from '@domain/value-objects'

import { projectRecurringPaymentsForRange } from './recurring-projection'

export interface PlanningProjection {
  periodId: string
  projectedOpeningBalanceCents: SignedMoneyCents | null
  expectedIncomeCents: AmountCents
  projectedRecurringPaymentsCents: AmountCents
  projectedClosingBalanceCents: SignedMoneyCents | null
}

export interface CalculatePlanningProjectionInput {
  period: Period
  projectedOpeningBalanceCents: SignedMoneyCents | null
  incomes: readonly Income[]
  recurringPayments: readonly RecurringPayment[]
}

const isExpectedIncome = (income: Income): income is IncomeV2 =>
  'status' in income && income.status === 'expected'

export function calculatePlanningProjection({
  period,
  projectedOpeningBalanceCents,
  incomes,
  recurringPayments,
}: CalculatePlanningProjectionInput): PlanningProjection {
  const isActiveTarget = period.deletedAt === null
  const expectedIncomeCents = incomes
    .filter(
      (income) =>
        isActiveTarget &&
        income.deletedAt === null &&
        income.periodId === period.id &&
        isExpectedIncome(income),
    )
    .reduce((total, income) => total + income.amount, 0)
  const projectedRecurringPaymentsCents = isActiveTarget
    ? projectRecurringPaymentsForRange({
        recurringPayments,
        startDate: period.startDate,
        endDate: period.endDate,
      }).reduce((total, payment) => total + payment.amount, 0)
    : 0

  return {
    periodId: period.id,
    projectedOpeningBalanceCents,
    expectedIncomeCents,
    projectedRecurringPaymentsCents,
    projectedClosingBalanceCents:
      projectedOpeningBalanceCents === null
        ? null
        : projectedOpeningBalanceCents +
          expectedIncomeCents -
          projectedRecurringPaymentsCents,
  }
}
