import { DomainError } from './DomainError'
export class PeriodOverlapError extends DomainError {
  constructor() {
    super('El periodo se solapa con un periodo existente.')
  }
}
