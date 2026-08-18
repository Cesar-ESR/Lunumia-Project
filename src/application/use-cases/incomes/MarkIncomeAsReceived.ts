import type { Clock } from '@application/services/IdGenerator'
import { IncomeTransitionError } from '@domain/errors'
import type { IncomeV2 } from '@domain/entities'
import type { IIncomeRepository } from '@domain/repositories'

export class MarkIncomeAsReceived {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<IncomeV2> {
    const current = await this.incomes.findById(id)
    if (!current) throw new Error('El ingreso no existe.')
    if (!('status' in current))
      throw new Error(
        'El ingreso legacy debe migrarse antes de cambiar estado.',
      )
    if (current.status === 'received') return current
    if (current.status !== 'expected')
      throw new IncomeTransitionError(current.status, 'received')
    const now = this.clock.now()
    const updated = await this.incomes.update({
      ...current,
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    })
    if (!('status' in updated))
      throw new Error('El repositorio devolvió un ingreso legacy inesperado.')
    return updated
  }
}
