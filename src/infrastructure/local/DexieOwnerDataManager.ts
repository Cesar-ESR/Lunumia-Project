import type {
  GuestDataSummary,
  OwnerDataPort,
} from '@application/services/DataMigrationService'
import type { SyncEntityType, SyncOperation } from '@domain/entities'
import { GastoClaroDB } from './database'
import { setActiveOwnerId, type KeyValueStorage } from './GuestOwnerStore'
import {
  createSyncOperation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from './sync-mutations'

const unresolvedOperationStatuses = new Set<SyncOperation['status']>([
  'pending',
  'processing',
  'error',
])

export class DexieOwnerDataManager implements OwnerDataPort {
  constructor(
    private readonly db: GastoClaroDB,
    private readonly storage: KeyValueStorage = globalThis.localStorage,
    private readonly onMigrationStep: (tableName: string) => void = () =>
      undefined,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }

  private readonly sync: SyncMutationDependencies

  async summarize(ownerId: string): Promise<GuestDataSummary> {
    const [
      periods,
      incomes,
      expenses,
      categories,
      budgets,
      recurringPayments,
      occurrences,
    ] = await Promise.all([
      this.db.periods
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
      this.db.incomes
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
      this.db.expenses
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
      this.db.categories
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
      this.db.categoryBudgets
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
      this.db.recurringPayments
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
      this.db.recurringPaymentOccurrences
        .where('ownerId')
        .equals(ownerId)
        .filter((value) => value.deletedAt === null)
        .count(),
    ])
    return {
      periods,
      incomes,
      expenses,
      categories,
      budgets,
      recurringPayments,
      occurrences,
      hasData:
        periods +
          incomes +
          expenses +
          categories +
          budgets +
          recurringPayments +
          occurrences >
        0,
    }
  }

  async migrateOwner(
    sourceOwnerId: string,
    targetOwnerId: string,
  ): Promise<void> {
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
        this.db.syncOperations,
        this.db.userSettings,
        this.db.deviceSyncStates,
      ],
      async () => {
        this.onMigrationStep('periods')
        const periods = (
          await this.db.periods.where('ownerId').equals(sourceOwnerId).toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.periods.bulkPut(periods)
        this.onMigrationStep('incomes')
        const incomes = (
          await this.db.incomes.where('ownerId').equals(sourceOwnerId).toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.incomes.bulkPut(incomes)
        this.onMigrationStep('expenses')
        const expenses = (
          await this.db.expenses
            .where('ownerId')
            .equals(sourceOwnerId)
            .toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.expenses.bulkPut(expenses)
        this.onMigrationStep('categories')
        const categories = (
          await this.db.categories
            .where('ownerId')
            .equals(sourceOwnerId)
            .toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.categories.bulkPut(categories)
        this.onMigrationStep('categoryBudgets')
        const categoryBudgets = (
          await this.db.categoryBudgets
            .where('ownerId')
            .equals(sourceOwnerId)
            .toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.categoryBudgets.bulkPut(categoryBudgets)
        this.onMigrationStep('recurringPayments')
        const recurringPayments = (
          await this.db.recurringPayments
            .where('ownerId')
            .equals(sourceOwnerId)
            .toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.recurringPayments.bulkPut(recurringPayments)
        this.onMigrationStep('recurringPaymentOccurrences')
        const recurringPaymentOccurrences = (
          await this.db.recurringPaymentOccurrences
            .where('ownerId')
            .equals(sourceOwnerId)
            .toArray()
        ).map((value) => ({
          ...value,
          ownerId: targetOwnerId,
          syncStatus: 'pending' as const,
        }))
        await this.db.recurringPaymentOccurrences.bulkPut(
          recurringPaymentOccurrences,
        )
        this.onMigrationStep('syncOperations')
        await this.db.syncOperations
          .where('ownerId')
          .equals(sourceOwnerId)
          .delete()
        this.onMigrationStep('userSettings')
        const userSettings = (
          await this.db.userSettings
            .where('ownerId')
            .equals(sourceOwnerId)
            .toArray()
        ).map((value) => ({ ...value, ownerId: targetOwnerId }))
        await this.db.userSettings.bulkPut(userSettings)
        this.onMigrationStep('deviceSyncStates')
        await this.db.deviceSyncStates
          .where('ownerId')
          .equals(sourceOwnerId)
          .delete()

        const operations: SyncOperation[] = []
        const migrationInstant = this.sync.clock.now()
        const appendOperations = <
          T extends { id: string; updatedAt: string; deletedAt: string | null },
        >(
          entityType: SyncEntityType,
          values: T[],
        ) => {
          values.forEach((value) =>
            operations.push(
              createSyncOperation(
                this.sync,
                targetOwnerId,
                entityType,
                value.id,
                value.deletedAt === null ? 'create' : 'delete',
                value,
                migrationInstant,
              ),
            ),
          )
        }
        appendOperations('period', periods)
        appendOperations('income', incomes)
        appendOperations('expense', expenses)
        appendOperations('category', categories)
        appendOperations('categoryBudget', categoryBudgets)
        appendOperations('recurringPayment', recurringPayments)
        appendOperations(
          'recurringPaymentOccurrence',
          recurringPaymentOccurrences,
        )
        userSettings.forEach((value) =>
          operations.push(
            createSyncOperation(
              this.sync,
              targetOwnerId,
              'userSettings',
              value.id,
              'create',
              value,
              migrationInstant,
            ),
          ),
        )
        if (operations.length > 0)
          await this.db.syncOperations.bulkAdd(operations)
      },
    )
    setActiveOwnerId(targetOwnerId, this.storage)
  }

  async deleteOwner(ownerId: string): Promise<void> {
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
        this.db.syncOperations,
        this.db.userSettings,
        this.db.deviceSyncStates,
      ],
      () => this.deleteOwnerRows(ownerId),
    )
  }

  async deleteOwnerIfResolved(ownerId: string): Promise<number> {
    return this.db.transaction(
      'rw',
      [
        this.db.periods,
        this.db.incomes,
        this.db.expenses,
        this.db.categories,
        this.db.categoryBudgets,
        this.db.recurringPayments,
        this.db.recurringPaymentOccurrences,
        this.db.syncOperations,
        this.db.userSettings,
        this.db.deviceSyncStates,
      ],
      async () => {
        const unresolvedCount = await this.countUnresolvedOperations(ownerId)
        if (unresolvedCount > 0) return unresolvedCount
        await this.deleteOwnerRows(ownerId)
        return 0
      },
    )
  }

  countUnresolvedOperations(ownerId: string): Promise<number> {
    return this.db.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .filter((operation) => unresolvedOperationStatuses.has(operation.status))
      .count()
  }

  async hasLocalData(ownerId: string): Promise<boolean> {
    const summary = await this.summarize(ownerId)
    if (summary.hasData) return true
    return (
      (await this.db.userSettings.where('ownerId').equals(ownerId).count()) > 0
    )
  }

  private async deleteOwnerRows(ownerId: string): Promise<void> {
    await this.db.periods.where('ownerId').equals(ownerId).delete()
    await this.db.incomes.where('ownerId').equals(ownerId).delete()
    await this.db.expenses.where('ownerId').equals(ownerId).delete()
    await this.db.categories.where('ownerId').equals(ownerId).delete()
    await this.db.categoryBudgets.where('ownerId').equals(ownerId).delete()
    await this.db.recurringPayments.where('ownerId').equals(ownerId).delete()
    await this.db.recurringPaymentOccurrences
      .where('ownerId')
      .equals(ownerId)
      .delete()
    await this.db.syncOperations.where('ownerId').equals(ownerId).delete()
    await this.db.userSettings.where('ownerId').equals(ownerId).delete()
    await this.db.deviceSyncStates.where('ownerId').equals(ownerId).delete()
  }
}
