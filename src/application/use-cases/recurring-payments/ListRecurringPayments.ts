import type { IRecurringPaymentRepository } from '@domain/repositories'

export class ListRecurringPayments {
  constructor(private readonly payments: IRecurringPaymentRepository) {}
  execute() {
    return this.payments.findAll()
  }
}
