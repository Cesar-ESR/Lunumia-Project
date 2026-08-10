import type { IPeriodRepository } from '@domain/repositories'
export class ListPeriods {
  constructor(private readonly periods: IPeriodRepository) {}
  execute() {
    return this.periods.findAll()
  }
}
