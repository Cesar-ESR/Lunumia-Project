import type { IRecurringPaymentOccurrenceRepository } from '@domain/repositories'
import type { RecurringPaymentOccurrence } from '@domain/entities'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieRecurringPaymentOccurrenceRepository implements IRecurringPaymentOccurrenceRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async create(
    value: RecurringPaymentOccurrence,
  ): Promise<RecurringPaymentOccurrence> {
    const existing = await this.findByPaymentAndDueDate(
      value.recurringPaymentId,
      value.dueDate,
    )
    if (existing) return existing
    return persistLocalMutation(
      this.db,
      this.db.recurringPaymentOccurrences,
      this.ownerId,
      'recurringPaymentOccurrence',
      'create',
      this.sync,
      async () => {
        await this.db.recurringPaymentOccurrences.add(value)
        return value
      },
    )
  }
  async update(
    value: RecurringPaymentOccurrence,
  ): Promise<RecurringPaymentOccurrence> {
    return persistLocalMutation(
      this.db,
      this.db.recurringPaymentOccurrences,
      this.ownerId,
      'recurringPaymentOccurrence',
      'update',
      this.sync,
      async () => {
        await this.db.recurringPaymentOccurrences.put(value)
        return value
      },
    )
  }
  async findById(id: string): Promise<RecurringPaymentOccurrence | null> {
    const value = await this.db.recurringPaymentOccurrences.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }
  async findByPeriod(periodId: string): Promise<RecurringPaymentOccurrence[]> {
    return this.list((value) => value.periodId === periodId)
  }
  async findByPaymentAndPeriod(
    paymentId: string,
    periodId: string,
  ): Promise<RecurringPaymentOccurrence[]> {
    return this.list(
      (value) =>
        value.recurringPaymentId === paymentId && value.periodId === periodId,
    )
  }
  async findPendingByPeriod(
    periodId: string,
  ): Promise<RecurringPaymentOccurrence[]> {
    return this.list(
      (value) => value.periodId === periodId && value.status === 'pending',
    )
  }
  async findByPaymentAndDueDate(
    paymentId: string,
    dueDate: RecurringPaymentOccurrence['dueDate'],
  ): Promise<RecurringPaymentOccurrence | null> {
    return (
      (
        await this.list(
          (value) =>
            value.recurringPaymentId === paymentId && value.dueDate === dueDate,
        )
      )[0] ?? null
    )
  }
  private async list(
    predicate: (value: RecurringPaymentOccurrence) => boolean,
  ): Promise<RecurringPaymentOccurrence[]> {
    return (
      await this.db.recurringPaymentOccurrences
        .where('ownerId')
        .equals(this.ownerId)
        .toArray()
    )
      .filter((value) => value.deletedAt === null && predicate(value))
      .sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
      )
  }
}
