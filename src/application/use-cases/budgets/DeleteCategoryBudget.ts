import type { ICategoryBudgetRepository } from '@domain/repositories'
export class DeleteCategoryBudget {
  constructor(private readonly budgets: ICategoryBudgetRepository) {}
  async execute(periodId: string, categoryId: string) {
    const current = await this.budgets.findByPeriodAndCategory(
      periodId,
      categoryId,
    )
    if (!current) throw new Error('El presupuesto no existe.')
    await this.budgets.delete(current.id)
  }
}
