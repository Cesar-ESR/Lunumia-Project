import { createExpenseSchema } from '@application/contracts'
import type {
  ICategoryRepository,
  IExpenseRepository,
  IPeriodRepository,
} from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
import { resolveMovementPeriod } from '@application/use-cases/movements/resolveMovementPeriod'
export class UpdateExpense {
  constructor(
    private readonly expenses: IExpenseRepository,
    private readonly periods: IPeriodRepository,
    private readonly categories: ICategoryRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.expenses.findById(id)
    if (!current) throw new Error('El gasto no existe.')
    const value = createExpenseSchema.parse(input)
    if (value.ownerId !== current.ownerId)
      throw new Error('El gasto pertenece a otro propietario.')
    const period = await resolveMovementPeriod(
      this.periods,
      current.ownerId,
      value.date,
    )
    if (!(await this.categories.findById(value.categoryId)))
      throw new Error('La categoría no existe.')
    return this.expenses.update({
      ...current,
      ...value,
      ownerId: current.ownerId,
      periodId: period.id,
      recurringOccurrenceId: current.recurringOccurrenceId,
      ...('affectsBalance' in current
        ? {
            affectsBalance: value.affectsBalance ?? current.affectsBalance,
            balanceEffectiveAt: current.balanceEffectiveAt,
          }
        : {}),
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
