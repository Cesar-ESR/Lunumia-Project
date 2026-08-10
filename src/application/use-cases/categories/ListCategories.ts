import type { ICategoryRepository } from '@domain/repositories'

export class ListCategories {
  constructor(private readonly categories: ICategoryRepository) {}
  execute() {
    return this.categories.findAll()
  }
}
