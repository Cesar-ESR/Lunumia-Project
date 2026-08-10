import { createPeriodSchema } from '@application/contracts'
import { PeriodOverlapError } from '@domain/errors'
import type { IPeriodRepository } from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
export class CreatePeriod {
  constructor(
    private readonly periods: IPeriodRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: unknown) {
    const value = createPeriodSchema.parse(input)
    if (value.startDate > value.endDate)
      throw new Error('La fecha inicial no puede ser posterior a la final.')
    if (
      (await this.periods.findOverlapping(value.startDate, value.endDate))
        .length
    )
      throw new PeriodOverlapError()
    const now = this.clock.now()
    const period = {
      id: this.ids.generate(),
      ...value,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    }
    return this.periods.create(period)
  }
}
