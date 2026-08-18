import type {
  IPeriodRepository,
  IRecurringPaymentOccurrenceRepository,
  IRecurringPaymentRepository,
} from '@domain/repositories'
import { generateRecurringOccurrenceDates } from '@domain/rules'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'

export class GenerateOccurrencesForPeriod {
  constructor(
    private readonly periods: IPeriodRepository,
    private readonly payments: IRecurringPaymentRepository,
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(ownerId: string, periodId: string) {
    const period = await this.periods.findById(periodId)
    if (!period || period.ownerId !== ownerId)
      throw new Error('El periodo no existe.')
    const today = this.clock.now().slice(0, 10)
    if (today < period.startDate || today > period.endDate)
      throw new Error(
        'Sólo se pueden materializar ocurrencias para el periodo actual.',
      )
    const created = []
    let skippedExisting = 0
    for (const payment of await this.payments.findActive()) {
      const generationEnd =
        payment.endDate && payment.endDate < period.endDate
          ? payment.endDate
          : period.endDate
      if (generationEnd < period.startDate) continue
      for (const dueDate of generateRecurringOccurrenceDates(
        payment.frequency,
        payment.dueDate,
        period.startDate,
        generationEnd,
      )) {
        const existing = await this.occurrences.findByPaymentAndDueDate(
          payment.id,
          dueDate,
        )
        if (existing) {
          skippedExisting++
          continue
        }
        const now = this.clock.now()
        created.push(
          await this.occurrences.create({
            id: this.ids.generate(),
            ownerId,
            recurringPaymentId: payment.id,
            periodId,
            dueDate,
            status: 'pending',
            amount: payment.amount,
            transactionId: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            syncStatus: 'pending',
          }),
        )
      }
    }
    return { created, skippedExisting }
  }
}
