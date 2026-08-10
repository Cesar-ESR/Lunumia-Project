import { DomainError } from '@domain/errors/DomainError'
export type DateOnly = string
export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined)
    return false
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
}
export function createDateOnly(value: string): DateOnly {
  if (!isDateOnly(value))
    throw new DomainError(
      'La fecha debe ser válida y tener formato YYYY-MM-DD.',
    )
  return value
}
