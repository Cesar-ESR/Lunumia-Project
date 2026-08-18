import type { IExpenseRepository } from '@domain/repositories'
import type { RecurringPaymentTransaction } from '@application/services/RecurringPaymentTransaction'
export class DeleteExpense {
  constructor(
    private readonly expenses: IExpenseRepository,
    private readonly recurringTransaction: RecurringPaymentTransaction,
  ) {}
  async execute(id: string) {
    const expense = await this.expenses.findById(id)
    if (!expense) throw new Error('El gasto no existe.')
    if (expense.recurringOccurrenceId) {
      await this.recurringTransaction.deleteLinkedExpense(expense.ownerId, id)
      return
    }
    await this.expenses.delete(id)
  }
}
