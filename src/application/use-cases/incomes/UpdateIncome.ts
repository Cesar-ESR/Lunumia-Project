import { createIncomeSchema } from '@application/contracts'
import type { IIncomeRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class UpdateIncome {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.incomes.findById(id)
    if (!current) throw new Error('El ingreso no existe.')
    const value = createIncomeSchema.parse(input)
    return this.incomes.update({
      ...current,
      ...value,
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
