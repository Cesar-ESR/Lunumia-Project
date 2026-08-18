import { createIncomeSchema } from '@application/contracts'
import type { IIncomeRepository, IPeriodRepository } from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import {
  assertRequestedPeriod,
  resolveMovementPeriod,
} from '@application/use-cases/movements/resolveMovementPeriod'
export class CreateIncome {
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
      status: 'received',
      affectsBalance: value.affectsBalance ?? true,
      balanceEffectiveAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
