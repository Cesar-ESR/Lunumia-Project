import { createExpenseSchema } from '@application/contracts'
import type {
  ICategoryRepository,
  IExpenseRepository,
  IPeriodRepository,
} from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
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
    if (
      !(await this.periods.findById(value.periodId)) ||
      !(await this.categories.findById(value.categoryId))
    )
      throw new Error('El periodo o la categoría no existe.')
    const now = this.clock.now()
    return this.expenses.create({
      id: this.ids.generate(),
      ...value,
      recurringOccurrenceId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
