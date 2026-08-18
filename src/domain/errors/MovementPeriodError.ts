import { DomainError } from './DomainError'

export class MovementPeriodError extends DomainError {
  constructor(date: string) {
    super(`No existe un periodo activo que contenga la fecha ${date}.`)
  }
}
