import type { IIncomeRepository } from '@domain/repositories'

export class ListIncomesByPeriod {
  constructor(private readonly incomes: IIncomeRepository) {}
  execute(periodId: string) {
    return this.incomes.findByPeriod(periodId)
  }
}
