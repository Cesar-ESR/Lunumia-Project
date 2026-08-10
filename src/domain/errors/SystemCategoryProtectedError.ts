import { DomainError } from './DomainError'
export class SystemCategoryProtectedError extends DomainError {
  constructor() {
    super('La categoría del sistema no puede modificarse.')
  }
}
