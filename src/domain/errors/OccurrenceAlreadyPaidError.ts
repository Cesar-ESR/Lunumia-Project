import { DomainError } from './DomainError'
export class OccurrenceAlreadyPaidError extends DomainError {
  constructor() {
    super('La ocurrencia ya tiene un gasto asociado.')
  }
}
