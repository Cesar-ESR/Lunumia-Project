import Dexie, { type Table } from 'dexie'
import type {
  Category,
  CategoryBudget,
  DeviceSyncState,
  Expense,
  Income,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

type LegacyRecurringPayment = Omit<RecurringPayment, 'endDate'> & {
  endDate?: DateOnly | null
}
interface LegacyDeviceSyncState {
  id: string
  ownerId: string
  cursors?: Array<{
    entityType: DeviceSyncState['entityType']
    updatedAt: string
    entityId: string
  }>
}

export class GastoClaroDB extends Dexie {
  periods!: Table<Period, string>
  incomes!: Table<Income, string>
  expenses!: Table<Expense, string>
  categories!: Table<Category, string>
  categoryBudgets!: Table<CategoryBudget, string>
  recurringPayments!: Table<RecurringPayment, string>
  recurringPaymentOccurrences!: Table<RecurringPaymentOccurrence, string>
  syncOperations!: Table<SyncOperation, string>
  userSettings!: Table<UserSettings, string>
  deviceSyncStates!: Table<DeviceSyncState, string>
  constructor(databaseName = 'GastoClaroDB') {
    super(databaseName)
    this.version(1).stores({
      periods:
        'id, ownerId, [ownerId+startDate], [ownerId+endDate], [ownerId+updatedAt]',
      incomes: 'id, ownerId, periodId, [ownerId+periodId], [ownerId+updatedAt]',
      expenses:
        'id, ownerId, periodId, categoryId, recurringOccurrenceId, [ownerId+periodId], [ownerId+categoryId], [ownerId+updatedAt]',
      categories: 'id, ownerId, [ownerId+normalizedName], [ownerId+updatedAt]',
      categoryBudgets:
        'id, ownerId, periodId, categoryId, [ownerId+periodId], [ownerId+periodId+categoryId], [ownerId+updatedAt]',
      recurringPayments:
        'id, ownerId, categoryId, status, [ownerId+status], [ownerId+updatedAt]',
      recurringPaymentOccurrences:
        'id, ownerId, periodId, recurringPaymentId, dueDate, status, [ownerId+periodId], [recurringPaymentId+dueDate], [ownerId+updatedAt]',
      syncOperations:
        'operationId, ownerId, status, createdAt, [ownerId+status+createdAt]',
      userSettings: 'id, ownerId, [ownerId+updatedAt]',
      deviceSyncStates: 'id, ownerId',
    })
    this.version(2)
      .stores({
        recurringPayments:
          'id, ownerId, categoryId, status, [ownerId+status], [ownerId+updatedAt]',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<LegacyRecurringPayment>('recurringPayments')
          .toCollection()
          .modify((payment) => {
            if (payment.endDate === undefined) payment.endDate = null
          })
      })
    this.version(3)
      .stores({
        syncOperations:
          'operationId, ownerId, status, createdAt, [ownerId+status+createdAt], [ownerId+status+createdAt+operationId]',
        deviceSyncStates: 'id, ownerId, entityType, &[ownerId+entityType]',
      })
      .upgrade(async (transaction) => {
        const table =
          transaction.table<LegacyDeviceSyncState>('deviceSyncStates')
        const legacyStates = await table.toArray()
        await table.clear()
        const migrated = legacyStates.flatMap((state) =>
          (state.cursors ?? []).map((cursor) => ({
            id: `${state.ownerId}:${cursor.entityType}`,
            ownerId: state.ownerId,
            entityType: cursor.entityType,
            lastUpdatedAt: cursor.updatedAt,
            lastEntityId: cursor.entityId,
            lastSuccessfulSyncAt: null,
          })),
        )
        if (migrated.length > 0)
          await transaction
            .table<DeviceSyncState>('deviceSyncStates')
            .bulkPut(migrated)
      })
  }
}
