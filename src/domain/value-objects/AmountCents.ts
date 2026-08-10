import { DomainError } from '@domain/errors/DomainError'

export type AmountCents = number

export const isAmountCents = (value: unknown): value is AmountCents =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value >= 0

export function createAmountCents(value: number): AmountCents {
  if (!isAmountCents(value))
    throw new DomainError(
      'El monto debe ser un entero no negativo en centavos.',
    )
  return value
}
