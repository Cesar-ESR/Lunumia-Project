import { createPeriodSchema } from '@application/contracts'
import { PeriodOverlapError } from '@domain/errors'
import type { IPeriodRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class UpdatePeriod {
  constructor(
    private readonly periods: IPeriodRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.periods.findById(id)
    if (!current) throw new Error('El periodo no existe.')
    const value = createPeriodSchema.parse(input)
    if (
      value.startDate > value.endDate ||
      (await this.periods.findOverlapping(value.startDate, value.endDate, id))
        .length
    )
      throw new PeriodOverlapError()
    return this.periods.update({
      ...current,
      ...value,
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
