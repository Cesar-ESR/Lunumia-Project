import { createExpenseSchema } from '@application/contracts'
import type {
  ICategoryRepository,
  IExpenseRepository,
  IPeriodRepository,
} from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import {
  assertRequestedPeriod,
  resolveMovementPeriod,
} from '@application/use-cases/movements/resolveMovementPeriod'
export class CreateExpense {
  constructor(
    private readonly expenses: IExpenseRepository,
    private readonly periods: IPeriodRepository,
    private readonly categories: ICategoryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: unknown) {
    const value = createExpenseSchema.parse(input)
    const period = await resolveMovementPeriod(
      this.periods,
      value.ownerId,
      value.date,
    )
    assertRequestedPeriod(value.periodId, period, value.date)
    if (!(await this.categories.findById(value.categoryId)))
      throw new Error('La categoría no existe.')
    const now = this.clock.now()
    return this.expenses.create({
      id: this.ids.generate(),
      ...value,
      recurringOccurrenceId: null,
      affectsBalance: value.affectsBalance ?? true,
      balanceEffectiveAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
