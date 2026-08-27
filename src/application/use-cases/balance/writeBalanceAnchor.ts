import { setCurrentBalanceSchema } from '@application/contracts'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import type { IBalanceAnchorRepository } from '@domain/repositories'
import type { Instant } from '@domain/value-objects'

export async function writeBalanceAnchor(
  anchors: IBalanceAnchorRepository,
  ids: IdGenerator,
  clock: Clock,
  input: unknown,
  ledgerCutoffAt?: Instant,
) {
  const value = setCurrentBalanceSchema.parse(input)
  const now = clock.now()
  return anchors.create({
    id: ids.generate(),
    ownerId: value.ownerId,
    amount: value.amount,
    capturedAt: now,
    ledgerCutoffAt: ledgerCutoffAt ?? now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 'pending',
  })
}
