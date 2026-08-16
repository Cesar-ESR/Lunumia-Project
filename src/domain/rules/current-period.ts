import type { Period } from '@domain/entities'
import { CurrentPeriodConflictError } from '@domain/errors'
import type { DateOnly } from '@domain/value-objects'

import { getPeriodTemporalState } from './period-temporal-state'

export function resolveCurrentPeriod(
  periods: readonly Period[],
  today: DateOnly,
): Period | null {
  const currentPeriods = periods.filter(
    (period) =>
      period.deletedAt === null &&
      getPeriodTemporalState(period, today) === 'active',
  )

  if (currentPeriods.length > 1) throw new CurrentPeriodConflictError()
  return currentPeriods[0] ?? null
}
