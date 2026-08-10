import { createRecurringPaymentSchema } from '@application/contracts'
import type {
  ICategoryRepository,
  IRecurringPaymentRepository,
} from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
export class CreateRecurringPayment {
  constructor(
    private readonly payments: IRecurringPaymentRepository,
    private readonly categories: ICategoryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: unknown) {
    const value = createRecurringPaymentSchema.parse(input)
    if (!(await this.categories.findById(value.categoryId)))
      throw new Error('La categoría no existe.')
    const now = this.clock.now()
    return this.payments.create({
      id: this.ids.generate(),
      ...value,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
