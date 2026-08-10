import type { IRecurringPaymentOccurrenceRepository } from '@domain/repositories'

export class ListOccurrencesByPeriod {
  constructor(
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
  ) {}
  execute(periodId: string) {
    return this.occurrences.findByPeriod(periodId)
  }
}
