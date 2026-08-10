import type { Expense, RecurringPaymentOccurrence } from '@domain/entities'
export interface MarkOccurrenceAsPaidInput {
  ownerId: string
  occurrenceId: string
  paidDate: string
}
export interface MarkOccurrenceAsPaidResult {
  occurrence: RecurringPaymentOccurrence
  expense: Expense
}
export interface RecurringPaymentTransaction {
  markOccurrenceAsPaid(
    input: MarkOccurrenceAsPaidInput,
  ): Promise<MarkOccurrenceAsPaidResult>
}
