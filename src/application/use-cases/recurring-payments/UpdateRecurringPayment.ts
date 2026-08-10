import { createRecurringPaymentSchema } from '@application/contracts'
import type { IRecurringPaymentRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class UpdateRecurringPayment {
  constructor(
    private readonly payments: IRecurringPaymentRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.payments.findById(id)
    if (!current) throw new Error('El pago recurrente no existe.')
    const value = createRecurringPaymentSchema.parse(input)
    return this.payments.update({
      ...current,
      ...value,
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
