import { createExpenseSchema } from '@application/contracts'
import type { IExpenseRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class UpdateExpense {
  constructor(
    private readonly expenses: IExpenseRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.expenses.findById(id)
    if (!current) throw new Error('El gasto no existe.')
    const value = createExpenseSchema.parse(input)
    return this.expenses.update({
      ...current,
      ...value,
      recurringOccurrenceId: current.recurringOccurrenceId,
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
