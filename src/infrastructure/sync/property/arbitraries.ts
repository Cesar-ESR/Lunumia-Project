import fc from 'fast-check'
import type { z } from 'zod'
import { remoteRowSchemas } from '@application/contracts/sync.schema'
import type {
  SyncError,
  SynchronizableRecordByType,
} from '@application/services/SyncCoordinator'
import type {
  BalanceAnchor,
  Category,
  CategoryBudget,
  DeviceSyncState,
  Expense,
  ExpenseV2,
  Income,
  IncomeV2,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
  RecurringPaymentOccurrenceV2,
  SyncCursor,
  SyncEntityType,
  SyncOperation,
  SyncOperationStatus,
  SyncStatus,
  UserSettings,
} from '@domain/entities'

export const authenticatedOwnerIdArbitrary = fc.uuid()
export const guestOwnerIdArbitrary = fc.uuid().map((id) => `guest:${id}`)
export const operationIdArbitrary = fc.uuid()
export const entityIdArbitrary = fc.uuid()

const baseInstant = Date.UTC(2020, 0, 1)
const maxSeconds = 86_400 * 365 * 20
const maxDays = 365 * 20

function instantFromSeconds(seconds: number): string {
  return new Date(baseInstant + seconds * 1_000).toISOString()
}

function dateOnlyFromDays(days: number): string {
  return new Date(baseInstant + days * 86_400_000).toISOString().slice(0, 10)
}

export const instantArbitrary = fc
  .integer({ min: 0, max: maxSeconds })
  .map(instantFromSeconds)

export const dateOnlyArbitrary = fc
  .integer({ min: 0, max: maxDays })
  .map(dateOnlyFromDays)

export const amountCentsArbitrary = fc.integer({
  min: 0,
  max: 100_000_000,
})
export const positiveAmountCentsArbitrary = fc.integer({
  min: 1,
  max: 100_000_000,
})
export const signedAmountCentsArbitrary = fc.integer({
  min: -100_000_000,
  max: 100_000_000,
})
export const categoryNameArbitrary = fc.stringMatching(
  /^[A-Za-z][A-Za-z0-9 ]{0,39}$/,
)
export const descriptionArbitrary = fc.string({ maxLength: 120 })
export const colorArbitrary = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(
    (channels) =>
      `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
  )

const syncStatusArbitrary = fc.constantFrom<SyncStatus>(
  'synced',
  'pending',
  'error',
)

const uniqueEntityIdsArbitrary = fc
  .tuple(
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
  )
  .filter((ids) => new Set(ids).size === ids.length)

export interface SynchronizableEntitySet {
  period: Period
  income: IncomeV2
  expense: ExpenseV2
  category: Category
  categoryBudget: CategoryBudget
  recurringPayment: RecurringPayment
  recurringPaymentOccurrence: RecurringPaymentOccurrenceV2
  balanceAnchor: BalanceAnchor
  userSettings: UserSettings
}

export const synchronizableEntitySetArbitrary: fc.Arbitrary<SynchronizableEntitySet> =
  fc
    .record({
      ownerId: authenticatedOwnerIdArbitrary,
      ids: uniqueEntityIdsArbitrary,
      createdSeconds: fc.integer({ min: 0, max: maxSeconds - 86_400 }),
      updateDeltaSeconds: fc.integer({ min: 0, max: 86_400 }),
      deleted: fc.boolean(),
      startDay: fc.integer({ min: 0, max: maxDays - 60 }),
      periodDuration: fc.integer({ min: 1, max: 45 }),
      transactionOffset: fc.integer({ min: 0, max: 45 }),
      dueOffset: fc.integer({ min: 0, max: 45 }),
      periodType: fc.constantFrom<Period['type']>('monthly', 'biweekly'),
      incomeAmount: positiveAmountCentsArbitrary,
      expenseAmount: positiveAmountCentsArbitrary,
      budgetAmount: amountCentsArbitrary,
      paymentAmount: positiveAmountCentsArbitrary,
      anchorAmount: signedAmountCentsArbitrary,
      description: descriptionArbitrary,
      categoryName: categoryNameArbitrary,
      categoryColor: colorArbitrary,
      categoryIcon: fc.option(fc.string({ maxLength: 24 }), { nil: null }),
      isSystemCategory: fc.boolean(),
      frequency: fc.constantFrom<RecurringPayment['frequency']>(
        'weekly',
        'biweekly',
        'monthly',
      ),
      paymentStatus: fc.constantFrom<RecurringPayment['status']>(
        'active',
        'inactive',
      ),
      occurrenceStatus: fc.constantFrom<RecurringPaymentOccurrence['status']>(
        'pending',
        'paid',
        'skipped',
      ),
      syncStatus: syncStatusArbitrary,
      activePeriod: fc.boolean(),
      currency: fc.constantFrom('MXN', 'USD', 'EUR'),
      theme: fc.constantFrom<UserSettings['theme']>('light', 'dark', 'system'),
    })
    .map((value) => {
      const [
        generatedPeriodId,
        incomeId,
        expenseId,
        categoryId,
        categoryBudgetId,
        recurringPaymentId,
        occurrenceId,
        userSettingsId,
        balanceAnchorId,
      ] = value.ids
      const createdAt = instantFromSeconds(value.createdSeconds)
      const updatedAt = instantFromSeconds(
        value.createdSeconds + value.updateDeltaSeconds,
      )
      const deletedAt = value.deleted ? updatedAt : null
      const endDay = value.startDay + value.periodDuration
      const transactionDay =
        value.startDay + Math.min(value.transactionOffset, value.periodDuration)
      const dueDay =
        value.startDay + Math.min(value.dueOffset, value.periodDuration)
      const startDate = dateOnlyFromDays(value.startDay)
      const endDate = dateOnlyFromDays(endDay)
      const transactionDate = dateOnlyFromDays(transactionDay)
      const dueDate = dateOnlyFromDays(dueDay)
      const recurringOccurrenceId =
        value.occurrenceStatus === 'paid' ? occurrenceId : null
      const base = {
        ownerId: value.ownerId,
        createdAt,
        updatedAt,
        deletedAt,
        syncStatus: value.syncStatus,
      }

      return {
        period: {
          ...base,
          id: generatedPeriodId,
          type: value.periodType,
          startDate,
          endDate,
        },
        income: {
          ...base,
          id: incomeId,
          periodId: generatedPeriodId,
          amount: value.incomeAmount,
          description: value.description,
          date: transactionDate,
          status: 'received' as const,
          affectsBalance: true,
          balanceEffectiveAt: updatedAt,
        },
        expense: {
          ...base,
          id: expenseId,
          periodId: generatedPeriodId,
          categoryId,
          amount: value.expenseAmount,
          description: value.description,
          date: transactionDate,
          recurringOccurrenceId,
          affectsBalance: true,
          balanceEffectiveAt: updatedAt,
        },
        category: {
          ...base,
          id: categoryId,
          name: value.categoryName,
          normalizedName: value.categoryName.trim().toLowerCase(),
          color: value.categoryColor,
          icon: value.categoryIcon,
          isSystem: value.isSystemCategory,
        },
        categoryBudget: {
          ...base,
          id: categoryBudgetId,
          periodId: generatedPeriodId,
          categoryId,
          amount: value.budgetAmount,
        },
        recurringPayment: {
          ...base,
          id: recurringPaymentId,
          name: value.categoryName,
          amount: value.paymentAmount,
          frequency: value.frequency,
          dueDate,
          endDate: value.paymentStatus === 'inactive' ? endDate : null,
          categoryId,
          status: value.paymentStatus,
        },
        recurringPaymentOccurrence: {
          ...base,
          id: occurrenceId,
          recurringPaymentId,
          periodId: generatedPeriodId,
          dueDate,
          status: value.occurrenceStatus,
          transactionId: recurringOccurrenceId ? expenseId : null,
          amount: value.paymentAmount,
        },
        balanceAnchor: {
          ...base,
          id: balanceAnchorId,
          amount: value.anchorAmount,
          capturedAt: updatedAt,
          ledgerCutoffAt: createdAt,
        },
        userSettings: {
          id: userSettingsId,
          ownerId: value.ownerId,
          activePeriodId: value.activePeriod ? generatedPeriodId : null,
          currency: value.currency,
          theme: value.theme,
          createdAt,
          updatedAt,
        },
      }
    })

export const periodArbitrary: fc.Arbitrary<Period> =
  synchronizableEntitySetArbitrary.map((entities) => entities.period)
export const incomeArbitrary: fc.Arbitrary<IncomeV2> =
  synchronizableEntitySetArbitrary.map((entities) => entities.income)
export const expenseArbitrary: fc.Arbitrary<ExpenseV2> =
  synchronizableEntitySetArbitrary.map((entities) => entities.expense)
export const categoryArbitrary: fc.Arbitrary<Category> =
  synchronizableEntitySetArbitrary.map((entities) => entities.category)
export const categoryBudgetArbitrary: fc.Arbitrary<CategoryBudget> =
  synchronizableEntitySetArbitrary.map((entities) => entities.categoryBudget)
export const recurringPaymentArbitrary: fc.Arbitrary<RecurringPayment> =
  synchronizableEntitySetArbitrary.map((entities) => entities.recurringPayment)
export const recurringPaymentOccurrenceArbitrary: fc.Arbitrary<RecurringPaymentOccurrenceV2> =
  synchronizableEntitySetArbitrary.map(
    (entities) => entities.recurringPaymentOccurrence,
  )
export const userSettingsArbitrary: fc.Arbitrary<UserSettings> =
  synchronizableEntitySetArbitrary.map((entities) => entities.userSettings)
export const balanceAnchorArbitrary: fc.Arbitrary<BalanceAnchor> =
  synchronizableEntitySetArbitrary.map((entities) => entities.balanceAnchor)

export const syncCursorArbitrary: fc.Arbitrary<SyncCursor> = fc
  .option(fc.tuple(instantArbitrary, entityIdArbitrary), { nil: null })
  .map((cursor) => ({
    lastUpdatedAt: cursor?.[0] ?? null,
    lastEntityId: cursor?.[1] ?? null,
  }))

export const deviceSyncStateArbitrary: fc.Arbitrary<DeviceSyncState> = fc
  .record({
    id: entityIdArbitrary,
    ownerId: authenticatedOwnerIdArbitrary,
    entityType: fc.constantFrom<SyncEntityType>(
      'period',
      'income',
      'expense',
      'category',
      'categoryBudget',
      'recurringPayment',
      'recurringPaymentOccurrence',
      'balanceAnchor',
      'userSettings',
    ),
    cursor: syncCursorArbitrary,
    lastSuccessfulSyncAt: fc.option(instantArbitrary, { nil: null }),
  })
  .map(({ cursor, ...state }) => ({ ...state, ...cursor }))

type SyncableRecord =
  | Period
  | Income
  | Expense
  | Category
  | CategoryBudget
  | RecurringPayment
  | RecurringPaymentOccurrence
  | BalanceAnchor

export const syncableRecordArbitrary: fc.Arbitrary<SyncableRecord> = fc.oneof(
  periodArbitrary,
  incomeArbitrary,
  expenseArbitrary,
  categoryArbitrary,
  categoryBudgetArbitrary,
  recurringPaymentArbitrary,
  recurringPaymentOccurrenceArbitrary,
  balanceAnchorArbitrary,
)

export const tombstoneArbitrary: fc.Arbitrary<SyncableRecord> =
  syncableRecordArbitrary.map((record) => ({
    ...record,
    deletedAt: record.updatedAt,
    syncStatus: 'synced' as const,
  }))

const operationStatuses: readonly SyncOperationStatus[] = [
  'pending',
  'processing',
  'error',
]

function operationArbitraryFor<EntityType extends SyncEntityType>(
  entityType: EntityType,
  recordArbitrary: fc.Arbitrary<SynchronizableRecordByType[EntityType]>,
): fc.Arbitrary<SyncOperation> {
  return fc
    .record({
      operationId: operationIdArbitrary,
      record: recordArbitrary,
      operationType: fc.constantFrom('create' as const, 'update' as const),
      status: fc.constantFrom(...operationStatuses),
      errorMessage: fc.option(fc.string({ maxLength: 80 }), { nil: null }),
      retryCount: fc.integer({ min: 0, max: 20 }),
    })
    .map(({ record, ...operation }) => ({
      ...operation,
      ownerId: record.ownerId,
      entityType,
      entityId: record.id,
      payload: JSON.stringify(record),
      createdAt: record.updatedAt,
    }))
}

function deleteOperationArbitraryFor(
  entityType: Exclude<SyncEntityType, 'userSettings'>,
  recordArbitrary: fc.Arbitrary<SyncableRecord>,
): fc.Arbitrary<SyncOperation> {
  return fc
    .record({
      operationId: operationIdArbitrary,
      record: recordArbitrary,
      status: fc.constantFrom(...operationStatuses),
      errorMessage: fc.option(fc.string({ maxLength: 80 }), { nil: null }),
      retryCount: fc.integer({ min: 0, max: 20 }),
    })
    .map(({ record, ...operation }) => {
      const tombstone = {
        ...record,
        deletedAt: record.updatedAt,
        syncStatus: 'pending' as const,
      }
      return {
        ...operation,
        ownerId: record.ownerId,
        entityType,
        entityId: record.id,
        operationType: 'delete',
        payload: JSON.stringify(tombstone),
        createdAt: record.updatedAt,
      }
    })
}

export const syncOperationArbitrary: fc.Arbitrary<SyncOperation> = fc.oneof(
  operationArbitraryFor('period', periodArbitrary),
  operationArbitraryFor('income', incomeArbitrary),
  operationArbitraryFor('expense', expenseArbitrary),
  operationArbitraryFor('category', categoryArbitrary),
  operationArbitraryFor('categoryBudget', categoryBudgetArbitrary),
  operationArbitraryFor('recurringPayment', recurringPaymentArbitrary),
  operationArbitraryFor(
    'recurringPaymentOccurrence',
    recurringPaymentOccurrenceArbitrary,
  ),
  operationArbitraryFor('balanceAnchor', balanceAnchorArbitrary),
  operationArbitraryFor('userSettings', userSettingsArbitrary),
  deleteOperationArbitraryFor('period', periodArbitrary),
  deleteOperationArbitraryFor('income', incomeArbitrary),
  deleteOperationArbitraryFor('expense', expenseArbitrary),
  deleteOperationArbitraryFor('category', categoryArbitrary),
  deleteOperationArbitraryFor('categoryBudget', categoryBudgetArbitrary),
  deleteOperationArbitraryFor('recurringPayment', recurringPaymentArbitrary),
  deleteOperationArbitraryFor(
    'recurringPaymentOccurrence',
    recurringPaymentOccurrenceArbitrary,
  ),
  deleteOperationArbitraryFor('balanceAnchor', balanceAnchorArbitrary),
)

type RemoteRowSchemas = typeof remoteRowSchemas
export type RemoteRowByEntityType = {
  [EntityType in keyof RemoteRowSchemas]: z.infer<RemoteRowSchemas[EntityType]>
}
export type RemoteRow = RemoteRowByEntityType[SyncEntityType]

export const remoteRowArbitraryByEntityType: {
  [EntityType in SyncEntityType]: fc.Arbitrary<
    RemoteRowByEntityType[EntityType]
  >
} = {
  period: periodArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    type: record.type,
    start_date: record.startDate,
    end_date: record.endDate,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  income: incomeArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    period_id: record.periodId,
    amount: record.amount,
    description: record.description,
    date: record.date,
    status: record.status,
    affects_balance: record.affectsBalance,
    balance_effective_at: record.balanceEffectiveAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  expense: expenseArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    period_id: record.periodId,
    category_id: record.categoryId,
    amount: record.amount,
    description: record.description,
    date: record.date,
    recurring_occurrence_id: record.recurringOccurrenceId,
    affects_balance: record.affectsBalance,
    balance_effective_at: record.balanceEffectiveAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  category: categoryArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    name: record.name,
    normalized_name: record.normalizedName,
    color: record.color,
    icon: record.icon,
    is_system: record.isSystem,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  categoryBudget: categoryBudgetArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    period_id: record.periodId,
    category_id: record.categoryId,
    amount: record.amount,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  recurringPayment: recurringPaymentArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    name: record.name,
    amount: record.amount,
    frequency: record.frequency,
    due_date: record.dueDate,
    end_date: record.endDate,
    category_id: record.categoryId,
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  recurringPaymentOccurrence: recurringPaymentOccurrenceArbitrary.map(
    (record) => ({
      id: record.id,
      user_id: record.ownerId,
      recurring_payment_id: record.recurringPaymentId,
      period_id: record.periodId,
      due_date: record.dueDate,
      status: record.status,
      amount: record.amount,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      deleted_at: record.deletedAt,
    }),
  ),
  balanceAnchor: balanceAnchorArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    amount: record.amount,
    captured_at: record.capturedAt,
    ledger_cutoff_at: record.ledgerCutoffAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  })),
  userSettings: userSettingsArbitrary.map((record) => ({
    id: record.id,
    user_id: record.ownerId,
    active_period_id: record.activePeriodId,
    currency: record.currency,
    theme: record.theme,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  })),
}

export const remoteRowArbitrary: fc.Arbitrary<RemoteRow> = fc.oneof(
  remoteRowArbitraryByEntityType.period,
  remoteRowArbitraryByEntityType.income,
  remoteRowArbitraryByEntityType.expense,
  remoteRowArbitraryByEntityType.category,
  remoteRowArbitraryByEntityType.categoryBudget,
  remoteRowArbitraryByEntityType.recurringPayment,
  remoteRowArbitraryByEntityType.recurringPaymentOccurrence,
  remoteRowArbitraryByEntityType.balanceAnchor,
  remoteRowArbitraryByEntityType.userSettings,
)

const syncStages: readonly SyncError['stage'][] = [
  'validation',
  'upload',
  'download',
]

export const retryableSyncErrorArbitrary: fc.Arbitrary<SyncError> = fc.record({
  stage: fc.constantFrom(...syncStages),
  kind: fc.constantFrom('network' as const, 'server' as const),
  code: fc.option(fc.string({ maxLength: 16 }), { nil: null }),
  retryable: fc.constant(true),
  message: fc.constant('Error transitorio de sincronizacion.'),
  operationId: fc.option(operationIdArbitrary, { nil: undefined }),
  entityType: fc.option(
    fc.constantFrom<SyncEntityType>(
      'period',
      'income',
      'expense',
      'category',
      'categoryBudget',
      'recurringPayment',
      'recurringPaymentOccurrence',
      'balanceAnchor',
      'userSettings',
    ),
    { nil: undefined },
  ),
})

export const nonRetryableSyncErrorArbitrary: fc.Arbitrary<SyncError> =
  fc.record({
    stage: fc.constantFrom(...syncStages),
    kind: fc.constantFrom(
      'unauthenticated' as const,
      'permission_denied' as const,
      'validation' as const,
      'conflict' as const,
      'unknown' as const,
    ),
    code: fc.option(fc.string({ maxLength: 16 }), { nil: null }),
    retryable: fc.constant(false),
    message: fc.constant('Error permanente de sincronizacion.'),
    operationId: fc.option(operationIdArbitrary, { nil: undefined }),
    entityType: fc.option(
      fc.constantFrom<SyncEntityType>(
        'period',
        'income',
        'expense',
        'category',
        'categoryBudget',
        'recurringPayment',
        'recurringPaymentOccurrence',
        'balanceAnchor',
        'userSettings',
      ),
      { nil: undefined },
    ),
  })

export const syncErrorArbitrary: fc.Arbitrary<SyncError> = fc.oneof(
  retryableSyncErrorArbitrary,
  nonRetryableSyncErrorArbitrary,
)

export interface CursorRow {
  id: string
  updatedAt: string
}

export const cursorRowsArbitrary = fc
  .array(fc.record({ id: entityIdArbitrary, updatedAt: instantArbitrary }), {
    minLength: 0,
    maxLength: 250,
  })
  .map((rows) => {
    const unique = new Map(rows.map((row) => [row.id, row]))
    return [...unique.values()].sort(compareCursorRows)
  })

export function compareCursorRows(left: CursorRow, right: CursorRow): number {
  return (
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.id.localeCompare(right.id)
  )
}
