import Dexie, { type Table } from 'dexie'
import type {
  BalanceAnchor,
  Category,
  CategoryBudget,
  DeviceSyncState,
  Expense,
  ExpenseV2,
  Income,
  IncomeV2,
  LegacyExpense,
  LegacyIncome,
  LegacyRecurringPaymentOccurrence,
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

type MigratingIncome = LegacyIncome &
  Partial<Pick<IncomeV2, 'status' | 'affectsBalance' | 'balanceEffectiveAt'>>
type MigratingExpense = LegacyExpense &
  Partial<Pick<ExpenseV2, 'affectsBalance' | 'balanceEffectiveAt'>>
type MigratingOccurrence = LegacyRecurringPaymentOccurrence & {
  amount?: unknown
}
type MigratingPayment = Omit<RecurringPayment, 'amount'> & { amount: unknown }

const paymentKey = (ownerId: string, paymentId: string): string =>
  JSON.stringify([ownerId, paymentId])

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

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
  balanceAnchors!: Table<BalanceAnchor, string>
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
    this.version(4)
      .stores({
        periods:
          'id, ownerId, [ownerId+startDate], [ownerId+endDate], [ownerId+updatedAt]',
        incomes:
          'id, ownerId, periodId, [ownerId+periodId], [ownerId+updatedAt]',
        expenses:
          'id, ownerId, periodId, categoryId, recurringOccurrenceId, [ownerId+periodId], [ownerId+categoryId], [ownerId+updatedAt]',
        categories:
          'id, ownerId, [ownerId+normalizedName], [ownerId+updatedAt]',
        categoryBudgets:
          'id, ownerId, periodId, categoryId, [ownerId+periodId], [ownerId+periodId+categoryId], [ownerId+updatedAt]',
        recurringPayments:
          'id, ownerId, categoryId, status, [ownerId+status], [ownerId+updatedAt]',
        recurringPaymentOccurrences:
          'id, ownerId, periodId, recurringPaymentId, dueDate, status, [ownerId+periodId], [recurringPaymentId+dueDate], [ownerId+updatedAt]',
        syncOperations:
          'operationId, ownerId, status, createdAt, [ownerId+status+createdAt], [ownerId+status+createdAt+operationId]',
        userSettings: 'id, ownerId, [ownerId+updatedAt]',
        deviceSyncStates: 'id, ownerId, entityType, &[ownerId+entityType]',
        balanceAnchors:
          'id, ownerId, [ownerId+capturedAt+updatedAt+id], [ownerId+updatedAt]',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<MigratingIncome>('incomes')
          .toCollection()
          .modify((income) => {
            if (income.status === undefined) income.status = 'received'
            if (income.affectsBalance === undefined)
              income.affectsBalance = true
            if (income.balanceEffectiveAt === undefined)
              income.balanceEffectiveAt = income.createdAt
          })

        await transaction
          .table<MigratingExpense>('expenses')
          .toCollection()
          .modify((expense) => {
            if (expense.affectsBalance === undefined)
              expense.affectsBalance = true
            if (expense.balanceEffectiveAt === undefined)
              expense.balanceEffectiveAt = expense.createdAt
          })

        const payments = await transaction
          .table<MigratingPayment>('recurringPayments')
          .toArray()
        const paymentsByOwnerAndId = new Map(
          payments.map((payment) => [
            paymentKey(payment.ownerId, payment.id),
            payment,
          ]),
        )
        const paymentsById = new Map(
          payments.map((payment) => [payment.id, payment]),
        )

        await transaction
          .table<MigratingOccurrence>('recurringPaymentOccurrences')
          .toCollection()
          .modify((occurrence) => {
            if (occurrence.amount !== undefined) {
              if (!isPositiveInteger(occurrence.amount))
                throw new Error(
                  `Cannot migrate recurring occurrence ${occurrence.id}: existing amount must be a positive integer.`,
                )
              return
            }

            const payment = paymentsByOwnerAndId.get(
              paymentKey(occurrence.ownerId, occurrence.recurringPaymentId),
            )
            if (!payment) {
              const referencedPayment = paymentsById.get(
                occurrence.recurringPaymentId,
              )
              const reason = referencedPayment
                ? `recurring payment belongs to owner ${referencedPayment.ownerId}, not ${occurrence.ownerId}`
                : `matching recurring payment was not found for owner ${occurrence.ownerId}`
              throw new Error(
                `Cannot migrate recurring occurrence ${occurrence.id}: ${reason}.`,
              )
            }
            if (!isPositiveInteger(payment.amount))
              throw new Error(
                `Cannot migrate recurring occurrence ${occurrence.id}: recurring payment ${payment.id} amount must be a positive integer.`,
              )
            occurrence.amount = payment.amount
          })
      })
  }
}
