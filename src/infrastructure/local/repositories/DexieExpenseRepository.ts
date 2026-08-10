import type { IExpenseRepository } from '@domain/repositories'
import type { Expense } from '@domain/entities'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  persistOptionalLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieExpenseRepository implements IExpenseRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async create(value: Expense): Promise<Expense> {
    return persistLocalMutation(
      this.db,
      this.db.expenses,
      this.ownerId,
      'expense',
      'create',
      this.sync,
      async () => {
        await this.db.expenses.add(value)
        return value
      },
    )
  }
  async update(value: Expense): Promise<Expense> {
    return persistLocalMutation(
      this.db,
      this.db.expenses,
      this.ownerId,
      'expense',
      'update',
      this.sync,
      async () => {
        await this.db.expenses.put(value)
        return value
      },
    )
  }
  async delete(id: string): Promise<void> {
    await persistOptionalLocalMutation(
      this.db,
      this.db.expenses,
      this.ownerId,
      'expense',
      'delete',
      this.sync,
      async () => {
        const value = await this.db.expenses.get(id)
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
        await this.db.expenses.put(deleted)
        return deleted
      },
    )
  }
  async findById(id: string): Promise<Expense | null> {
    const value = await this.db.expenses.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }
  async findByPeriod(periodId: string): Promise<Expense[]> {
    return this.list('[ownerId+periodId]', [this.ownerId, periodId])
  }
  async findByCategory(categoryId: string): Promise<Expense[]> {
    return this.list('[ownerId+categoryId]', [this.ownerId, categoryId])
  }
  private async list(
    index: '[ownerId+periodId]' | '[ownerId+categoryId]',
    key: [string, string],
  ): Promise<Expense[]> {
    return (await this.db.expenses.where(index).equals(key).toArray())
      .filter((value) => value.deletedAt === null)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      )
  }
}
