import type { IRecurringPaymentRepository } from '@domain/repositories'
import type { RecurringPayment } from '@domain/entities'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  persistOptionalLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieRecurringPaymentRepository implements IRecurringPaymentRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async create(value: RecurringPayment): Promise<RecurringPayment> {
    return persistLocalMutation(
      this.db,
      this.db.recurringPayments,
      this.ownerId,
      'recurringPayment',
      'create',
      this.sync,
      async () => {
        await this.db.recurringPayments.add(value)
        return value
      },
    )
  }
  async update(value: RecurringPayment): Promise<RecurringPayment> {
    return persistLocalMutation(
      this.db,
      this.db.recurringPayments,
      this.ownerId,
      'recurringPayment',
      'update',
      this.sync,
      async () => {
        await this.db.recurringPayments.put(value)
        return value
      },
    )
  }
  async delete(id: string): Promise<void> {
    await persistOptionalLocalMutation(
      this.db,
      this.db.recurringPayments,
      this.ownerId,
      'recurringPayment',
      'delete',
      this.sync,
      async () => {
        const value = await this.db.recurringPayments.get(id)
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
        await this.db.recurringPayments.put(deleted)
        return deleted
      },
    )
  }
  async findById(id: string): Promise<RecurringPayment | null> {
    const value = await this.db.recurringPayments.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }
  async findActive(): Promise<RecurringPayment[]> {
    return (await this.findAll()).filter((value) => value.status === 'active')
  }
  async findAll(): Promise<RecurringPayment[]> {
    return (
      await this.db.recurringPayments
        .where('ownerId')
        .equals(this.ownerId)
        .toArray()
    )
      .filter((value) => value.deletedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }
  async findByCategory(categoryId: string): Promise<RecurringPayment[]> {
    return (await this.findAll()).filter(
      (value) => value.categoryId === categoryId,
    )
  }
}
