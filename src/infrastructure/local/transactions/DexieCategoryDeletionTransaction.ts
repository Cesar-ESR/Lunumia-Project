import type { CategoryDeletionTransaction } from '@application/services/CategoryDeletionTransaction'
import { GastoClaroDB } from '../database'
import {
  createSyncOperation,
  isAuthenticatedOwnerId,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieCategoryDeletionTransaction implements CategoryDeletionTransaction {
  private readonly sync: SyncMutationDependencies

  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }

  async reassignAndDelete(
    categoryId: string,
    replacementCategoryId: string,
  ): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.categories,
      this.db.expenses,
      this.db.recurringPayments,
      this.db.categoryBudgets,
      this.db.syncOperations,
      async () => {
        const category = await this.db.categories.get(categoryId)
        if (
          !category ||
          category.ownerId !== this.ownerId ||
          category.deletedAt !== null
        )
          throw new Error('Category does not exist.')
        const replacement = await this.db.categories.get(replacementCategoryId)
        if (
          !replacement ||
          replacement.ownerId !== this.ownerId ||
          replacement.deletedAt !== null
        )
          throw new Error('Replacement category does not exist.')

        const now = this.sync.clock.now()
        const expenses = (
          await this.db.expenses
            .where('[ownerId+categoryId]')
            .equals([this.ownerId, categoryId])
            .toArray()
        ).filter((value) => value.deletedAt === null)
        const payments = (
          await this.db.recurringPayments
            .where('ownerId')
            .equals(this.ownerId)
            .toArray()
        ).filter(
          (value) =>
            value.deletedAt === null && value.categoryId === categoryId,
        )
        const budgets = (
          await this.db.categoryBudgets
            .where('ownerId')
            .equals(this.ownerId)
            .toArray()
        ).filter(
          (value) =>
            value.deletedAt === null && value.categoryId === categoryId,
        )
        const updatedExpenses = expenses.map((value) => ({
          ...value,
          categoryId: replacementCategoryId,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }))
        const updatedPayments = payments.map((value) => ({
          ...value,
          categoryId: replacementCategoryId,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }))
        const deletedBudgets = budgets.map((value) => ({
          ...value,
          deletedAt: now,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }))
        const deletedCategory = {
          ...category,
          deletedAt: now,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }

        await this.db.expenses.bulkPut(updatedExpenses)
        await this.db.recurringPayments.bulkPut(updatedPayments)
        await this.db.categoryBudgets.bulkPut(deletedBudgets)
        await this.db.categories.put(deletedCategory)

        if (
          this.sync.origin === 'local-user' &&
          isAuthenticatedOwnerId(this.ownerId)
        ) {
          const operations = [
            ...updatedExpenses.map((value) =>
              createSyncOperation(
                this.sync,
                this.ownerId,
                'expense',
                value.id,
                'update',
                value,
                now,
              ),
            ),
            ...updatedPayments.map((value) =>
              createSyncOperation(
                this.sync,
                this.ownerId,
                'recurringPayment',
                value.id,
                'update',
                value,
                now,
              ),
            ),
            ...deletedBudgets.map((value) =>
              createSyncOperation(
                this.sync,
                this.ownerId,
                'categoryBudget',
                value.id,
                'delete',
                value,
                now,
              ),
            ),
            createSyncOperation(
              this.sync,
              this.ownerId,
              'category',
              deletedCategory.id,
              'delete',
              deletedCategory,
              now,
            ),
          ]
          await this.db.syncOperations.bulkAdd(operations)
        }
      },
    )
  }
}
