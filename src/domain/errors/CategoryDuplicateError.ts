import { DomainError } from './DomainError'
export class CategoryDuplicateError extends DomainError {
  constructor(name: string) {
    super(`La categoría "${name}" ya existe.`)
  }
}
