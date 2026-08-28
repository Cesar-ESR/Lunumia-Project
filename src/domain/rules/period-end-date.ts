import type { PeriodType } from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function derivePeriodEndDate(
  type: PeriodType,
  startDate: DateOnly,
): DateOnly {
  const [year, month, day] = startDate.split('-').map(Number) as [
    number,
    number,
    number,
  ]

  if (type === 'biweekly')
    return formatUtcDate(new Date(Date.UTC(year, month - 1, day + 14)))

  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const sameDayNextMonth = new Date(
    Date.UTC(year, month, Math.min(day, lastDayOfNextMonth)),
  )
  return formatUtcDate(
    new Date(sameDayNextMonth.getTime() - MILLISECONDS_PER_DAY),
  )
}

function formatUtcDate(date: Date): DateOnly {
  return date.toISOString().slice(0, 10)
}
