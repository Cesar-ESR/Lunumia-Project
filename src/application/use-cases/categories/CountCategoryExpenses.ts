import type { ICategoryRepository } from '@domain/repositories'

export class CountCategoryExpenses {
  constructor(private readonly categories: ICategoryRepository) {}
  execute(categoryId: string) {
    return this.categories.countExpensesByCategory(categoryId)
  }
}
