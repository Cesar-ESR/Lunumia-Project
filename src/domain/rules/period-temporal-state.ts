import type { Period, PeriodTemporalState } from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

export function getPeriodTemporalState(
  period: Period,
  today: DateOnly,
): PeriodTemporalState {
  if (today < period.startDate) return 'future'
  if (today > period.endDate) return 'ended'
  return 'active'
}
