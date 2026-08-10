import type { IPeriodRepository } from '@domain/repositories'
import type { Period } from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  persistOptionalLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexiePeriodRepository implements IPeriodRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async create(period: Period): Promise<Period> {
    return persistLocalMutation(
      this.db,
      this.db.periods,
      this.ownerId,
      'period',
      'create',
      this.sync,
      async () => {
        await this.db.periods.add(period)
        return period
      },
    )
  }
  async update(period: Period): Promise<Period> {
    return persistLocalMutation(
      this.db,
      this.db.periods,
      this.ownerId,
      'period',
      'update',
      this.sync,
      async () => {
        await this.db.periods.put(period)
        return period
      },
    )
  }
  async delete(id: string): Promise<void> {
    await persistOptionalLocalMutation(
      this.db,
      this.db.periods,
      this.ownerId,
      'period',
      'delete',
      this.sync,
      async () => {
        const value = await this.db.periods.get(id)
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
        await this.db.periods.put(deleted)
        return deleted
      },
    )
  }
  async findById(id: string): Promise<Period | null> {
    const period = await this.db.periods.get(id)
    return period?.ownerId === this.ownerId && period.deletedAt === null
      ? period
      : null
  }
  async findAll(): Promise<Period[]> {
    return (
      await this.db.periods.where('ownerId').equals(this.ownerId).toArray()
    )
      .filter((value) => value.deletedAt === null)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  }
  async findOverlapping(
    start: DateOnly,
    end: DateOnly,
    excludeId?: string,
  ): Promise<Period[]> {
    return (await this.findAll()).filter(
      (period) =>
        period.id !== excludeId &&
        period.startDate <= end &&
        start <= period.endDate,
    )
  }
  async findByDateRange(date: DateOnly): Promise<Period | null> {
    return (
      (await this.findAll()).find(
        (period) => period.startDate <= date && date <= period.endDate,
      ) ?? null
    )
  }
}
