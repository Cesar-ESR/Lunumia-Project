import { MovementPeriodError } from '@domain/errors'
import type { Period } from '@domain/entities'
import type { IPeriodRepository } from '@domain/repositories'
import type { DateOnly } from '@domain/value-objects'

export async function resolveMovementPeriod(
  periods: IPeriodRepository,
  ownerId: string,
  date: DateOnly,
): Promise<Period> {
  const period = await periods.findByDateRange(date)
  if (!period || period.ownerId !== ownerId) throw new MovementPeriodError(date)
  return period
}

export function assertRequestedPeriod(
  requestedPeriodId: string,
  resolvedPeriod: Period,
  date: DateOnly,
): void {
  if (requestedPeriodId !== resolvedPeriod.id)
    throw new MovementPeriodError(date)
}
