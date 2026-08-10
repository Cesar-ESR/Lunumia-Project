import { DomainError } from '@domain/errors/DomainError'

export type SignedMoneyCents = number
export const isSignedMoneyCents = (value: unknown): value is SignedMoneyCents =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
export function createSignedMoneyCents(value: number): SignedMoneyCents {
  if (!isSignedMoneyCents(value))
    throw new DomainError('El monto debe ser un entero finito en centavos.')
  return value
}
