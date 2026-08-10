import type { IExpenseRepository } from '@domain/repositories'

export class ListExpensesByPeriod {
  constructor(private readonly expenses: IExpenseRepository) {}
  execute(periodId: string) {
    return this.expenses.findByPeriod(periodId)
  }
}
