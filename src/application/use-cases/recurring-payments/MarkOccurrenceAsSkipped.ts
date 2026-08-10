import type { IRecurringPaymentOccurrenceRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class MarkOccurrenceAsSkipped {
  constructor(
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
    private readonly clock: Clock,
  ) {}
  async execute(periodId: string, occurrenceId: string) {
    const occurrence = (await this.occurrences.findByPeriod(periodId)).find(
      (value) => value.id === occurrenceId,
    )
    if (!occurrence || occurrence.status !== 'pending')
      throw new Error('La ocurrencia no está pendiente.')
    return this.occurrences.update({
      ...occurrence,
      status: 'skipped',
      transactionId: null,
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
