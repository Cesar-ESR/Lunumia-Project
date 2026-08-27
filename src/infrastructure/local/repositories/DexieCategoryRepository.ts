import type { ICategoryRepository } from '@domain/repositories'
import type { Category } from '@domain/entities'
import { normalizeCategoryName } from '@domain/rules'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  persistOptionalLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieCategoryRepository implements ICategoryRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async create(value: Category): Promise<Category> {
    return persistLocalMutation(
      this.db,
      this.db.categories,
      this.ownerId,
      'category',
      'create',
      this.sync,
      async () => {
        await this.db.categories.add(value)
        return value
      },
    )
  }
  async update(value: Category): Promise<Category> {
    return persistLocalMutation(
      this.db,
      this.db.categories,
      this.ownerId,
      'category',
      'update',
      this.sync,
      async () => {
        await this.db.categories.put(value)
        return value
      },
    )
  }
  async delete(id: string): Promise<void> {
    await persistOptionalLocalMutation(
      this.db,
      this.db.categories,
      this.ownerId,
      'category',
      'delete',
      this.sync,
      async () => {
        const value = await this.db.categories.get(id)
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
        await this.db.categories.put(deleted)
        return deleted
      },
    )
  }
  async findById(id: string): Promise<Category | null> {
    const value = await this.db.categories.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }
  async findAll(): Promise<Category[]> {
    return (await this.findAllIncludingDeleted())
      .filter((value) => value.deletedAt === null)
  }
  async findAllIncludingDeleted(): Promise<Category[]> {
    return (
      await this.db.categories.where('ownerId').equals(this.ownerId).toArray()
    ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }
  async findByNormalizedName(name: string): Promise<Category | null> {
    return (
      (await this.findAll()).find(
        (value) => value.normalizedName === normalizeCategoryName(name),
      ) ?? null
    )
  }
  async countExpensesByCategory(categoryId: string): Promise<number> {
    return (
      await this.db.expenses
        .where('[ownerId+categoryId]')
        .equals([this.ownerId, categoryId])
        .toArray()
    ).filter((value) => value.deletedAt === null).length
  }
  async findSystemCategory(): Promise<Category> {
    const category = (await this.findAll()).find((value) => value.isSystem)
    if (!category) throw new Error('No existe la categoría del sistema.')
    return category
  }
}
