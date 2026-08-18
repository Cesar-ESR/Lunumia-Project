import type { RecurringPayment } from '@domain/entities'
import { generateRecurringOccurrenceDates } from '@domain/rules'
import type { AmountCents, DateOnly } from '@domain/value-objects'

export interface ProjectedRecurringPayment {
  recurringPaymentId: string
  dueDate: DateOnly
  amount: AmountCents
}

export interface ProjectRecurringPaymentsForRangeInput {
  recurringPayments: readonly RecurringPayment[]
  startDate: DateOnly
  endDate: DateOnly
}

export function projectRecurringPaymentsForRange({
  recurringPayments,
  startDate,
  endDate,
}: ProjectRecurringPaymentsForRangeInput): ProjectedRecurringPayment[] {
  if (endDate < startDate) return []

  return recurringPayments
    .flatMap((payment) => {
      if (payment.deletedAt !== null || payment.status !== 'active') return []
      const generationEnd =
        payment.endDate !== null && payment.endDate < endDate
          ? payment.endDate
          : endDate
      if (generationEnd < startDate) return []

      return generateRecurringOccurrenceDates(
        payment.frequency,
        payment.dueDate,
        startDate,
        generationEnd,
      ).map((dueDate) => ({
        recurringPaymentId: payment.id,
        dueDate,
        amount: payment.amount,
      }))
    })
    .sort(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) ||
        left.recurringPaymentId.localeCompare(right.recurringPaymentId),
    )
}
