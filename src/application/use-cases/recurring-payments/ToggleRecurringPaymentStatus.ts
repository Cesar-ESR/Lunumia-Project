import type { IRecurringPaymentRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class ToggleRecurringPaymentStatus {
  constructor(
    private readonly payments: IRecurringPaymentRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string) {
    const current = await this.payments.findById(id)
    if (!current) throw new Error('El pago recurrente no existe.')
    return this.payments.update({
      ...current,
      status: current.status === 'active' ? 'inactive' : 'active',
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
