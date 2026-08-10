import type { IPeriodRepository } from '@domain/repositories'
export class DeletePeriod {
  constructor(private readonly periods: IPeriodRepository) {}
  async execute(id: string) {
    if (!(await this.periods.findById(id)))
      throw new Error('El periodo no existe.')
    await this.periods.delete(id)
  }
}
