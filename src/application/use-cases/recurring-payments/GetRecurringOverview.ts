import { computePendingCommitments } from '@domain/calculations'
import type {
  IRecurringPaymentOccurrenceRepository,
  IRecurringPaymentRepository,
} from '@domain/repositories'

export class GetRecurringOverview {
  constructor(
    private readonly payments: IRecurringPaymentRepository,
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
  ) {}
  async execute(periodId: string | null) {
    const payments = await this.payments.findAll()
    const occurrences = periodId
      ? await this.occurrences.findByPeriod(periodId)
      : []
    return {
      payments,
      occurrences,
      pendingCommitments: periodId
        ? computePendingCommitments(occurrences, payments, periodId)
        : 0,
    }
  }
}
