import { createIncomeSchema } from '@application/contracts'
import type { IIncomeRepository, IPeriodRepository } from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
export class CreateIncome {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly periods: IPeriodRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: unknown) {
    const value = createIncomeSchema.parse(input)
    if (!(await this.periods.findById(value.periodId)))
      throw new Error('El periodo no existe.')
    const now = this.clock.now()
    return this.incomes.create({
      id: this.ids.generate(),
      ...value,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
