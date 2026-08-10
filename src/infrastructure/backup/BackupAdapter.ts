import type { BackupData } from '@application/contracts/backup.schema'
import type { BackupDataSource } from '@application/services/BackupDataSource'
import type {
  SyncableEntity,
  SyncEntityType,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  createSyncOperation,
  isAuthenticatedOwnerId,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '@infrastructure/local/sync-mutations'

function sortRecords<T extends { id: string; createdAt: string }>(
  records: T[],
): T[] {
  return records.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  )
}

function asActive<T extends { deletedAt: string | null }>(
  records: T[],
): Array<T & { deletedAt: null }> {
  return records.map((record) => ({ ...record, deletedAt: null }))
}

export class BackupAdapter implements BackupDataSource {
  private readonly sync: SyncMutationDependencies

  constructor(
    private readonly db: GastoClaroDB,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }

  async readActive(ownerId: string): Promise<BackupData> {
    return this.db.transaction(
      'r',
      [
        this.db.periods,
        this.db.incomes,
        this.db.expenses,
        this.db.categories,
        this.db.categoryBudgets,
        this.db.recurringPayments,
        this.db.recurringPaymentOccurrences,
        this.db.userSettings,
      ],
      async () => {
        const [
          periods,
          incomes,
          expenses,
          categories,
          categoryBudgets,
          recurringPayments,
          recurringPaymentOccurrences,
          userSettings,
        ] = await Promise.all([
          this.db.periods
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.incomes
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.expenses
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.categories
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.categoryBudgets
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.recurringPayments
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.recurringPaymentOccurrences
            .where('ownerId')
            .equals(ownerId)
            .filter(({ deletedAt }) => deletedAt === null)
            .toArray(),
          this.db.userSettings.where('ownerId').equals(ownerId).toArray(),
        ])
        return {
          periods: sortRecords(asActive(periods)),
          incomes: sortRecords(asActive(incomes)),
          expenses: sortRecords(asActive(expenses)),
          categories: sortRecords(asActive(categories)),
          categoryBudgets: sortRecords(asActive(categoryBudgets)),
          recurringPayments: sortRecords(asActive(recurringPayments)),
          recurringPaymentOccurrences: sortRecords(
            asActive(recurringPaymentOccurrences),
          ),
          userSettings: sortRecords(userSettings).slice(0, 1),
        }
      },
    )
  }

  async replace(ownerId: string, data: BackupData): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.periods,
        this.db.incomes,
        this.db.expenses,
        this.db.categories,
        this.db.categoryBudgets,
        this.db.recurringPayments,
        this.db.recurringPaymentOccurrences,
        this.db.userSettings,
        this.db.syncOperations,
      ],
      async () => {
        const authenticated =
          this.sync.origin === 'local-user' && isAuthenticatedOwnerId(ownerId)
        const now = this.sync.clock.now()
        const [
          oldPeriods,
          oldIncomes,
          oldExpenses,
          oldCategories,
          oldBudgets,
          oldPayments,
          oldOccurrences,
          oldSettings,
        ] = await Promise.all([
          this.db.periods.where('ownerId').equals(ownerId).toArray(),
          this.db.incomes.where('ownerId').equals(ownerId).toArray(),
          this.db.expenses.where('ownerId').equals(ownerId).toArray(),
          this.db.categories.where('ownerId').equals(ownerId).toArray(),
          this.db.categoryBudgets.where('ownerId').equals(ownerId).toArray(),
          this.db.recurringPayments.where('ownerId').equals(ownerId).toArray(),
          this.db.recurringPaymentOccurrences
            .where('ownerId')
            .equals(ownerId)
            .toArray(),
          this.db.userSettings.where('ownerId').equals(ownerId).toArray(),
        ])

        const operations: SyncOperation[] = []
        const prepare = <T extends SyncableEntity>(
          entityType: SyncEntityType,
          existing: T[],
          incoming: T[],
        ): T[] => {
          const currentById = new Map(
            existing.map((value) => [value.id, value]),
          )
          const incomingIds = new Set(incoming.map((value) => value.id))
          const active = incoming.map((value) => ({
            ...value,
            ownerId,
            deletedAt: null,
            syncStatus: 'pending' as const,
          }))
          const tombstones = authenticated
            ? existing
                .filter(
                  (value) =>
                    value.deletedAt === null && !incomingIds.has(value.id),
                )
                .map((value) => ({
                  ...value,
                  deletedAt: now,
                  updatedAt: now,
                  syncStatus: 'pending' as const,
                }))
            : []
          const retainedTombstones = authenticated
            ? existing.filter(
                (value) =>
                  value.deletedAt !== null && !incomingIds.has(value.id),
              )
            : []
          if (authenticated) {
            active.forEach((value) =>
              operations.push(
                createSyncOperation(
                  this.sync,
                  ownerId,
                  entityType,
                  value.id,
                  currentById.get(value.id)?.deletedAt === null
                    ? 'update'
                    : 'create',
                  value,
                  now,
                ),
              ),
            )
            tombstones.forEach((value) =>
              operations.push(
                createSyncOperation(
                  this.sync,
                  ownerId,
                  entityType,
                  value.id,
                  'delete',
                  value,
                  now,
                ),
              ),
            )
          }
          return [...active, ...tombstones, ...retainedTombstones]
        }

        const periods = prepare('period', oldPeriods, data.periods)
        const incomes = prepare('income', oldIncomes, data.incomes)
        const expenses = prepare('expense', oldExpenses, data.expenses)
        const categories = prepare('category', oldCategories, data.categories)
        const categoryBudgets = prepare(
          'categoryBudget',
          oldBudgets,
          data.categoryBudgets,
        )
        const recurringPayments = prepare(
          'recurringPayment',
          oldPayments,
          data.recurringPayments,
        )
        const recurringPaymentOccurrences = prepare(
          'recurringPaymentOccurrence',
          oldOccurrences,
          data.recurringPaymentOccurrences,
        )
        const userSettings: UserSettings[] = data.userSettings.map((value) => ({
          ...value,
          ownerId,
        }))
        if (authenticated) {
          userSettings.forEach((value) =>
            operations.push(
              createSyncOperation(
                this.sync,
                ownerId,
                'userSettings',
                value.id,
                oldSettings.length > 0 ? 'update' : 'create',
                value,
                now,
              ),
            ),
          )
          if (userSettings.length === 0) {
            oldSettings.forEach((value) =>
              operations.push(
                createSyncOperation(
                  this.sync,
                  ownerId,
                  'userSettings',
                  value.id,
                  'delete',
                  { ...value, deletedAt: now },
                  now,
                ),
              ),
            )
          }
        }

        await Promise.all([
          this.db.periods.where('ownerId').equals(ownerId).delete(),
          this.db.incomes.where('ownerId').equals(ownerId).delete(),
          this.db.expenses.where('ownerId').equals(ownerId).delete(),
          this.db.categories.where('ownerId').equals(ownerId).delete(),
          this.db.categoryBudgets.where('ownerId').equals(ownerId).delete(),
          this.db.recurringPayments.where('ownerId').equals(ownerId).delete(),
          this.db.recurringPaymentOccurrences
            .where('ownerId')
            .equals(ownerId)
            .delete(),
          this.db.userSettings.where('ownerId').equals(ownerId).delete(),
        ])

        await this.db.periods.bulkAdd(periods)
        await this.db.incomes.bulkAdd(incomes)
        await this.db.expenses.bulkAdd(expenses)
        await this.db.categories.bulkAdd(categories)
        await this.db.categoryBudgets.bulkAdd(categoryBudgets)
        await this.db.recurringPayments.bulkAdd(recurringPayments)
        await this.db.recurringPaymentOccurrences.bulkAdd(
          recurringPaymentOccurrences,
        )
        await this.db.userSettings.bulkAdd(userSettings)
        if (operations.length > 0)
          await this.db.syncOperations.bulkAdd(operations)
      },
    )
  }
}
