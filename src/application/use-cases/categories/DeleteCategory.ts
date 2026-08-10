import { SystemCategoryProtectedError } from '@domain/errors'
import type { ICategoryRepository } from '@domain/repositories'
import type { CategoryDeletionTransaction } from '@application/services/CategoryDeletionTransaction'

export class DeleteCategory {
  constructor(
    private readonly categories: ICategoryRepository,
    private readonly transaction: CategoryDeletionTransaction,
  ) {}

  async execute(id: string): Promise<void> {
    const current = await this.categories.findById(id)
    if (!current) throw new Error('Category does not exist.')
    if (current.isSystem) throw new SystemCategoryProtectedError()

    const uncategorized = await this.categories.findSystemCategory()
    if (uncategorized.id === id) throw new SystemCategoryProtectedError()
    await this.transaction.reassignAndDelete(id, uncategorized.id)
  }
}
