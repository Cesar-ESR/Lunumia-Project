import { DomainError } from './DomainError'

export class CurrentPeriodConflictError extends DomainError {
  constructor() {
    super('Existe más de un periodo actual para la fecha indicada.')
  }
}
