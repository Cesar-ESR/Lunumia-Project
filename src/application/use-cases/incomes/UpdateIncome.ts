import { createIncomeSchema } from '@application/contracts'
import type { IIncomeRepository, IPeriodRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
import { resolveMovementPeriod } from '@application/use-cases/movements/resolveMovementPeriod'
export class UpdateIncome {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly periods: IPeriodRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.incomes.findById(id)
    if (!current) throw new Error('El ingreso no existe.')
    const value = createIncomeSchema.parse(input)
    if (value.ownerId !== current.ownerId)
      throw new Error('El ingreso pertenece a otro propietario.')
    const period = await resolveMovementPeriod(
      this.periods,
      current.ownerId,
      value.date,
    )
    return this.incomes.update({
      ...current,
      ...value,
      ownerId: current.ownerId,
      periodId: period.id,
      ...('status' in current
        ? {
            status: current.status,
            affectsBalance: value.affectsBalance ?? current.affectsBalance,
            balanceEffectiveAt: current.balanceEffectiveAt,
          }
        : {}),
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
