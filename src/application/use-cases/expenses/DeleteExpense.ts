import type { IExpenseRepository } from '@domain/repositories'
export class DeleteExpense {
  constructor(private readonly expenses: IExpenseRepository) {}
  async execute(id: string) {
    if (!(await this.expenses.findById(id)))
      throw new Error('El gasto no existe.')
    await this.expenses.delete(id)
  }
}
