import type { IncomeStatus } from '@domain/entities'
import { DomainError } from './DomainError'

export class IncomeTransitionError extends DomainError {
  constructor(from: IncomeStatus, to: IncomeStatus) {
    super(`No se permite cambiar un ingreso de ${from} a ${to}.`)
  }
}
