import type { IIncomeRepository } from '@domain/repositories'
import type { Income } from '@domain/entities'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  persistOptionalLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieIncomeRepository implements IIncomeRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async create(value: Income): Promise<Income> {
    return persistLocalMutation(
      this.db,
      this.db.incomes,
      this.ownerId,
      'income',
      'create',
      this.sync,
      async () => {
        await this.db.incomes.add(value)
        return value
      },
    )
  }
  async update(value: Income): Promise<Income> {
    return persistLocalMutation(
      this.db,
      this.db.incomes,
      this.ownerId,
      'income',
      'update',
      this.sync,
      async () => {
        await this.db.incomes.put(value)
        return value
      },
    )
  }
  async delete(id: string): Promise<void> {
    await persistOptionalLocalMutation(
      this.db,
      this.db.incomes,
      this.ownerId,
      'income',
      'delete',
      this.sync,
      async () => {
        const value = await this.db.incomes.get(id)
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
        await this.db.incomes.put(deleted)
        return deleted
      },
    )
  }
  async findById(id: string): Promise<Income | null> {
    const value = await this.db.incomes.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }
  async findByPeriod(periodId: string): Promise<Income[]> {
    return (
      await this.db.incomes
        .where('[ownerId+periodId]')
        .equals([this.ownerId, periodId])
        .toArray()
    )
      .filter((value) => value.deletedAt === null)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      )
  }
}
