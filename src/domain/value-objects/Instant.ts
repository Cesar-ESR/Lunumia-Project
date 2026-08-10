import { DomainError } from '@domain/errors/DomainError'
export type Instant = string
export const isInstant = (value: unknown): value is Instant =>
  typeof value === 'string' &&
  !Number.isNaN(Date.parse(value)) &&
  value.endsWith('Z')
export function createInstant(value: string): Instant {
  if (!isInstant(value))
    throw new DomainError('El instante debe ser ISO 8601 UTC válido.')
  return value
}
export const createCurrentInstant = (): Instant => new Date().toISOString()
