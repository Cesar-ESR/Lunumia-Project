import { upsertCategoryBudgetSchema } from '@application/contracts'
import type {
  ICategoryBudgetRepository,
  ICategoryRepository,
  IPeriodRepository,
} from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
export class UpsertCategoryBudget {
  constructor(
    private readonly budgets: ICategoryBudgetRepository,
    private readonly periods: IPeriodRepository,
    private readonly categories: ICategoryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: unknown) {
    const value = upsertCategoryBudgetSchema.parse(input)
    if (
      !(await this.periods.findById(value.periodId)) ||
      !(await this.categories.findById(value.categoryId))
    )
      throw new Error('El periodo o la categoría no existe.')
    const now = this.clock.now()
    return this.budgets.upsert({
      id: this.ids.generate(),
      ...value,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
