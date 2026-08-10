import type { Frequency } from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

const parse = (value: DateOnly) =>
  value.split('-').map(Number) as [number, number, number]
const format = (year: number, month: number, day: number): DateOnly =>
  `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()
const addDays = (value: DateOnly, days: number): DateOnly => {
  const [year, month, day] = parse(value)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return format(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}
const addMonths = (
  value: DateOnly,
  months: number,
  anchorDay: number,
): DateOnly => {
  const [year, month] = parse(value)
  const index = year * 12 + month - 1 + months
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return format(
    nextYear,
    nextMonth,
    Math.min(anchorDay, daysInMonth(nextYear, nextMonth)),
  )
}

export function generateRecurringOccurrenceDates(
  frequency: Frequency,
  dueDate: DateOnly,
  periodStart: DateOnly,
  periodEnd: DateOnly,
): DateOnly[] {
  const stepDays =
    frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 0
  const [, , anchorDay] = parse(dueDate)
  let candidate = dueDate
  while (candidate < periodStart)
    candidate = stepDays
      ? addDays(candidate, stepDays)
      : addMonths(candidate, 1, anchorDay)
  const result: DateOnly[] = []
  while (candidate <= periodEnd) {
    result.push(candidate)
    candidate = stepDays
      ? addDays(candidate, stepDays)
      : addMonths(candidate, 1, anchorDay)
  }
  return result
}
