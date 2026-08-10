import type { CategoryBudget } from '@domain/entities'
import type { ICategoryBudgetRepository } from '@domain/repositories'

export class ListBudgetsByPeriod {
  constructor(private readonly budgets: ICategoryBudgetRepository) {}

  execute(periodId: string): Promise<CategoryBudget[]> {
    return this.budgets.findByPeriod(periodId)
  }
}
