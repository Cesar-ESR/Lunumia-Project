import { z } from 'zod'
import {
  APP_NAME,
  CURRENT_BACKUP_SCHEMA_VERSION,
  LEGACY_BACKUP_APP_NAME,
} from '@shared/constants'
import { isDateOnly } from '@domain/value-objects'

const ownerIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim().length > 0,
    'El propietario no puede contener únicamente espacios.',
  )
const persistedTextSchema = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .refine(
      (value) => value.trim().length > 0,
      'El texto no puede contener únicamente espacios.',
    )
const uuidSchema = z.string().uuid()
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe usar el formato YYYY-MM-DD.')
  .refine(isDateOnly, 'Debe ser una fecha de calendario válida.')
const instantSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'Debe ser un instante UTC ISO 8601.',
  )
const syncStatusSchema = z.enum(['synced', 'pending', 'error'])
const positiveCentsSchema = z.number().int().positive()
const nonNegativeCentsSchema = z.number().int().nonnegative()

const syncableShape = {
  id: uuidSchema,
  ownerId: ownerIdSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: z.null(),
  syncStatus: syncStatusSchema,
}

export const backupPeriodSchema = z
  .object({
    ...syncableShape,
    type: z.enum(['monthly', 'biweekly']),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
  })
  .strict()
  .refine((period) => period.startDate <= period.endDate, {
    path: ['endDate'],
    message: 'La fecha final debe ser igual o posterior a la inicial.',
  })

export const backupIncomeSchema = z
  .object({
    ...syncableShape,
    periodId: uuidSchema,
    amount: positiveCentsSchema,
    description: persistedTextSchema(200),
    date: dateOnlySchema,
  })
  .strict()

export const backupExpenseSchema = z
  .object({
    ...syncableShape,
    periodId: uuidSchema,
    categoryId: uuidSchema,
    amount: positiveCentsSchema,
    description: persistedTextSchema(200),
    date: dateOnlySchema,
    recurringOccurrenceId: uuidSchema.nullable(),
  })
  .strict()

export const backupCategorySchema = z
  .object({
    ...syncableShape,
    name: persistedTextSchema(80),
    normalizedName: persistedTextSchema(80),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    icon: z.string().max(80).nullable(),
    isSystem: z.boolean(),
  })
  .strict()

export const backupCategoryBudgetSchema = z
  .object({
    ...syncableShape,
    periodId: uuidSchema,
    categoryId: uuidSchema,
    amount: nonNegativeCentsSchema,
  })
  .strict()

export const backupRecurringPaymentSchema = z
  .object({
    ...syncableShape,
    name: persistedTextSchema(200),
    amount: positiveCentsSchema,
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    dueDate: dateOnlySchema,
    endDate: dateOnlySchema.nullable(),
    categoryId: uuidSchema,
    status: z.enum(['active', 'inactive']),
  })
  .strict()
  .refine(
    (payment) => payment.endDate === null || payment.endDate >= payment.dueDate,
    {
      path: ['endDate'],
      message: 'La fecha final debe ser igual o posterior a la fecha inicial.',
    },
  )

export const backupRecurringPaymentOccurrenceSchema = z
  .object({
    ...syncableShape,
    recurringPaymentId: uuidSchema,
    periodId: uuidSchema,
    dueDate: dateOnlySchema,
    status: z.enum(['pending', 'paid', 'skipped']),
    transactionId: uuidSchema.nullable(),
  })
  .strict()
  .superRefine((occurrence, context) => {
    if (occurrence.status === 'paid' && occurrence.transactionId === null) {
      context.addIssue({
        code: 'custom',
        path: ['transactionId'],
        message: 'Una ocurrencia pagada debe referenciar un gasto.',
      })
    }
    if (occurrence.status !== 'paid' && occurrence.transactionId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['transactionId'],
        message: 'Solo una ocurrencia pagada puede referenciar un gasto.',
      })
    }
  })

export const backupUserSettingsSchema = z
  .object({
    id: uuidSchema,
    ownerId: ownerIdSchema,
    activePeriodId: uuidSchema.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    theme: z.enum(['light', 'dark', 'system']),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()

export const backupDataSchema = z
  .object({
    periods: z.array(backupPeriodSchema),
    incomes: z.array(backupIncomeSchema),
    expenses: z.array(backupExpenseSchema),
    categories: z.array(backupCategorySchema),
    categoryBudgets: z.array(backupCategoryBudgetSchema),
    recurringPayments: z.array(backupRecurringPaymentSchema),
    recurringPaymentOccurrences: z.array(
      backupRecurringPaymentOccurrenceSchema,
    ),
    userSettings: z.array(backupUserSettingsSchema).max(1),
  })
  .strict()

export const backupFileSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_BACKUP_SCHEMA_VERSION),
    appName: z.union([z.literal(APP_NAME), z.literal(LEGACY_BACKUP_APP_NAME)]),
    exportedAt: instantSchema,
    ownerId: ownerIdSchema,
    data: backupDataSchema,
  })
  .strict()

export const backupVersionEnvelopeSchema = z
  .object({
    schemaVersion: z.number().int().nonnegative(),
  })
  .passthrough()

export type BackupData = z.infer<typeof backupDataSchema>
export type BackupFile = z.infer<typeof backupFileSchema>
