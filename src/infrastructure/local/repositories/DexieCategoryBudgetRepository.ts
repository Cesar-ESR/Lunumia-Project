import type { ICategoryBudgetRepository } from '@domain/repositories'
import type { CategoryBudget } from '@domain/entities'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  persistOptionalLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieCategoryBudgetRepository implements ICategoryBudgetRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async upsert(value: CategoryBudget): Promise<CategoryBudget> {
    let operationType: 'create' | 'update' = 'create'
    return persistLocalMutation(
      this.db,
      this.db.categoryBudgets,
      this.ownerId,
      'categoryBudget',
      () => operationType,
      this.sync,
      async () => {
        const existing = await this.db.categoryBudgets
          .where('[ownerId+periodId+categoryId]')
          .equals([this.ownerId, value.periodId, value.categoryId])
          .first()
        operationType =
          existing && existing.deletedAt === null ? 'update' : 'create'
        const result =
          existing && existing.deletedAt === null
            ? {
                ...value,
                id: existing.id,
                createdAt: existing.createdAt,
                updatedAt: this.sync.clock.now(),
              }
            : value
        await this.db.categoryBudgets.put(result)
        return result
      },
    )
  }
  async delete(id: string): Promise<void> {
    await persistOptionalLocalMutation(
      this.db,
      this.db.categoryBudgets,
      this.ownerId,
      'categoryBudget',
      'delete',
      this.sync,
      async () => {
        const value = await this.db.categoryBudgets.get(id)
        if (
          !value ||
          value.ownerId !== this.ownerId ||
          value.deletedAt !== null
        )
          return null
        const now = this.sync.clock.now()
        const deleted = {
          ...value,
          deletedAt: now,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }
        await this.db.categoryBudgets.put(deleted)
        return deleted
      },
    )
  }
  async findById(id: string): Promise<CategoryBudget | null> {
    const value = await this.db.categoryBudgets.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }
  async findByPeriod(periodId: string): Promise<CategoryBudget[]> {
    return (
      await this.db.categoryBudgets
        .where('[ownerId+periodId]')
        .equals([this.ownerId, periodId])
        .toArray()
    )
      .filter((value) => value.deletedAt === null)
      .sort(
        (a, b) =>
          a.categoryId.localeCompare(b.categoryId) || a.id.localeCompare(b.id),
      )
  }
  async findByPeriodAndCategory(
    periodId: string,
    categoryId: string,
  ): Promise<CategoryBudget | null> {
    return (
      (await this.findByPeriod(periodId)).find(
        (value) => value.categoryId === categoryId,
      ) ?? null
    )
  }
}
