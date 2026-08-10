import type {
  MarkOccurrenceAsPaidInput,
  RecurringPaymentTransaction,
} from '@application/services/RecurringPaymentTransaction'
export class MarkOccurrenceAsPaid {
  constructor(private readonly transaction: RecurringPaymentTransaction) {}
  execute(input: MarkOccurrenceAsPaidInput) {
    return this.transaction.markOccurrenceAsPaid(input)
  }
}
