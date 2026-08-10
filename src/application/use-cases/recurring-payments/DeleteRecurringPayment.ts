import type { IRecurringPaymentRepository } from '@domain/repositories'
export class DeleteRecurringPayment {
  constructor(private readonly payments: IRecurringPaymentRepository) {}
  async execute(id: string) {
    if (!(await this.payments.findById(id)))
      throw new Error('El pago recurrente no existe.')
    await this.payments.delete(id)
  }
}
