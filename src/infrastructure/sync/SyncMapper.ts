import { z } from 'zod'
import { remoteRowSchemas } from '@application/contracts/sync.schema'
import type {
  RemoteEntityChange,
  SynchronizableRecord,
} from '@application/services/SyncCoordinator'
import type {
  Category,
  CategoryBudget,
  Expense,
  Income,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
  SyncEntityType,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import type { Json } from '@infrastructure/remote/database.types'

const instantSchema = z.string().datetime({ offset: true })
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const uuidSchema = z.string().uuid()
const localBaseSchema = z.object({
  id: uuidSchema,
  ownerId: uuidSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
  syncStatus: z.enum(['synced', 'pending', 'error']),
})

const localSchemas = {
  period: localBaseSchema.extend({
    type: z.enum(['monthly', 'biweekly']),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
  }),
  income: localBaseSchema.extend({
    periodId: uuidSchema,
    amount: z.number().int().nonnegative().safe(),
    description: z.string(),
    date: dateOnlySchema,
  }),
  expense: localBaseSchema.extend({
    periodId: uuidSchema,
    categoryId: uuidSchema,
    amount: z.number().int().nonnegative().safe(),
    description: z.string(),
    date: dateOnlySchema,
    recurringOccurrenceId: uuidSchema.nullable(),
  }),
  category: localBaseSchema.extend({
    name: z.string(),
    normalizedName: z.string(),
    color: z.string(),
    icon: z.string().nullable(),
    isSystem: z.boolean(),
  }),
  categoryBudget: localBaseSchema.extend({
    periodId: uuidSchema,
    categoryId: uuidSchema,
    amount: z.number().int().nonnegative().safe(),
  }),
  recurringPayment: localBaseSchema.extend({
    name: z.string(),
    amount: z.number().int().nonnegative().safe(),
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    dueDate: dateOnlySchema,
    endDate: dateOnlySchema.nullable(),
    categoryId: uuidSchema,
    status: z.enum(['active', 'inactive']),
  }),
  recurringPaymentOccurrence: localBaseSchema.extend({
    recurringPaymentId: uuidSchema,
    periodId: uuidSchema,
    dueDate: dateOnlySchema,
    status: z.enum(['pending', 'paid', 'skipped']),
    transactionId: uuidSchema.nullable(),
  }),
  userSettings: z.object({
    id: uuidSchema,
    ownerId: uuidSchema,
    activePeriodId: uuidSchema.nullable(),
    currency: z.string(),
    theme: z.enum(['light', 'dark', 'system']),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  }),
} as const

const compoundPaymentSchema = z.object({
  occurrence: localSchemas.recurringPaymentOccurrence,
  expense: localSchemas.expense,
})

export function serializeOperationPayload(operation: SyncOperation): Json {
  const parsedJson: unknown = JSON.parse(operation.payload)
  if (operation.operationType === 'pay_recurring_occurrence') {
    const value = compoundPaymentSchema.parse(parsedJson)
    assertOwnership(operation, value.occurrence)
    if (value.expense.ownerId !== operation.ownerId) {
      throw new Error('El gasto compuesto pertenece a otro propietario.')
    }
    return {
      occurrence: toRemoteRecord(
        'recurringPaymentOccurrence',
        value.occurrence,
      ),
      expense: toRemoteRecord('expense', value.expense),
    }
  }

  const value = localSchemas[operation.entityType].parse(parsedJson)
  assertOwnership(operation, value)
  return toRemoteRecord(operation.entityType, value)
}

export function deserializeRemoteChange(
  entityType: SyncEntityType,
  input: unknown,
): RemoteEntityChange {
  switch (entityType) {
    case 'period': {
      const row = remoteRowSchemas.period.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          type: row.type,
          startDate: row.start_date,
          endDate: row.end_date,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies Period,
      }
    }
    case 'income': {
      const row = remoteRowSchemas.income.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          periodId: row.period_id,
          amount: row.amount,
          description: row.description,
          date: row.date,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies Income,
      }
    }
    case 'expense': {
      const row = remoteRowSchemas.expense.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          periodId: row.period_id,
          categoryId: row.category_id,
          amount: row.amount,
          description: row.description,
          date: row.date,
          recurringOccurrenceId: row.recurring_occurrence_id,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies Expense,
      }
    }
    case 'category': {
      const row = remoteRowSchemas.category.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          name: row.name,
          normalizedName: row.normalized_name,
          color: row.color,
          icon: row.icon,
          isSystem: row.is_system,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies Category,
      }
    }
    case 'categoryBudget': {
      const row = remoteRowSchemas.categoryBudget.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          periodId: row.period_id,
          categoryId: row.category_id,
          amount: row.amount,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies CategoryBudget,
      }
    }
    case 'recurringPayment': {
      const row = remoteRowSchemas.recurringPayment.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          name: row.name,
          amount: row.amount,
          frequency: row.frequency,
          dueDate: row.due_date,
          endDate: row.end_date,
          categoryId: row.category_id,
          status: row.status,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies RecurringPayment,
      }
    }
    case 'recurringPaymentOccurrence': {
      const row = remoteRowSchemas.recurringPaymentOccurrence.parse(input)
      return {
        entityType,
        record: withSyncState({
          id: row.id,
          ownerId: row.user_id,
          recurringPaymentId: row.recurring_payment_id,
          periodId: row.period_id,
          dueDate: row.due_date,
          status: row.status,
          transactionId: null,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
          deletedAt: normalizeNullableInstant(row.deleted_at),
        }) satisfies RecurringPaymentOccurrence,
      }
    }
    case 'userSettings': {
      const row = remoteRowSchemas.userSettings.parse(input)
      return {
        entityType,
        record: {
          id: row.id,
          ownerId: row.user_id,
          activePeriodId: row.active_period_id,
          currency: row.currency,
          theme: row.theme,
          createdAt: normalizeInstant(row.created_at),
          updatedAt: normalizeInstant(row.updated_at),
        } satisfies UserSettings,
      }
    }
  }
}

function toRemoteRecord(
  entityType: SyncEntityType,
  value: SynchronizableRecord,
): Json {
  switch (entityType) {
    case 'period': {
      const entity = localSchemas.period.parse(value)
      return {
        ...remoteBase(entity),
        type: entity.type,
        start_date: entity.startDate,
        end_date: entity.endDate,
      }
    }
    case 'income': {
      const entity = localSchemas.income.parse(value)
      return {
        ...remoteBase(entity),
        period_id: entity.periodId,
        amount: entity.amount,
        description: entity.description,
        date: entity.date,
      }
    }
    case 'expense': {
      const entity = localSchemas.expense.parse(value)
      return {
        ...remoteBase(entity),
        period_id: entity.periodId,
        category_id: entity.categoryId,
        amount: entity.amount,
        description: entity.description,
        date: entity.date,
        recurring_occurrence_id: entity.recurringOccurrenceId,
      }
    }
    case 'category': {
      const entity = localSchemas.category.parse(value)
      return {
        ...remoteBase(entity),
        name: entity.name,
        normalized_name: entity.normalizedName,
        color: entity.color,
        icon: entity.icon,
        is_system: entity.isSystem,
      }
    }
    case 'categoryBudget': {
      const entity = localSchemas.categoryBudget.parse(value)
      return {
        ...remoteBase(entity),
        period_id: entity.periodId,
        category_id: entity.categoryId,
        amount: entity.amount,
      }
    }
    case 'recurringPayment': {
      const entity = localSchemas.recurringPayment.parse(value)
      return {
        ...remoteBase(entity),
        name: entity.name,
        amount: entity.amount,
        frequency: entity.frequency,
        due_date: entity.dueDate,
        end_date: entity.endDate,
        category_id: entity.categoryId,
        status: entity.status,
      }
    }
    case 'recurringPaymentOccurrence': {
      const entity = localSchemas.recurringPaymentOccurrence.parse(value)
      return {
        ...remoteBase(entity),
        recurring_payment_id: entity.recurringPaymentId,
        period_id: entity.periodId,
        due_date: entity.dueDate,
        status: entity.status,
      }
    }
    case 'userSettings': {
      const entity = localSchemas.userSettings.parse(value)
      return {
        id: entity.id,
        user_id: entity.ownerId,
        active_period_id: entity.activePeriodId,
        currency: entity.currency,
        theme: entity.theme,
        created_at: entity.createdAt,
        updated_at: entity.updatedAt,
      }
    }
  }
}

function remoteBase(
  value: z.infer<typeof localBaseSchema>,
): Record<string, Json> {
  return {
    id: value.id,
    user_id: value.ownerId,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    deleted_at: value.deletedAt,
  }
}

function withSyncState<
  T extends
    | Omit<Period, 'syncStatus'>
    | Omit<Income, 'syncStatus'>
    | Omit<Expense, 'syncStatus'>
    | Omit<Category, 'syncStatus'>
    | Omit<CategoryBudget, 'syncStatus'>
    | Omit<RecurringPayment, 'syncStatus'>
    | Omit<RecurringPaymentOccurrence, 'syncStatus'>,
>(value: T): T & { syncStatus: 'synced' } {
  return { ...value, syncStatus: 'synced' }
}

function assertOwnership(
  operation: SyncOperation,
  value: { id: string; ownerId: string },
): void {
  if (value.id !== operation.entityId || value.ownerId !== operation.ownerId) {
    throw new Error('El payload no coincide con la identidad de la operación.')
  }
}

function normalizeInstant(value: string): string {
  return new Date(value).toISOString()
}

function normalizeNullableInstant(value: string | null): string | null {
  return value === null ? null : normalizeInstant(value)
}
