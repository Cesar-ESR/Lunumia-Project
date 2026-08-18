import { createIncomeSchema } from '@application/contracts'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import {
  assertRequestedPeriod,
  resolveMovementPeriod,
} from '@application/use-cases/movements/resolveMovementPeriod'
import type { IIncomeRepository, IPeriodRepository } from '@domain/repositories'

export class CreateExpectedIncome {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly periods: IPeriodRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: unknown) {
    const value = createIncomeSchema.parse(input)
    const period = await resolveMovementPeriod(
      this.periods,
      value.ownerId,
      value.date,
    )
    assertRequestedPeriod(value.periodId, period, value.date)
    const now = this.clock.now()
    return this.incomes.create({
      id: this.ids.generate(),
      ...value,
      status: 'expected',
      affectsBalance: false,
      balanceEffectiveAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
