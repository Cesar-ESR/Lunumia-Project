import { z } from 'zod'

const timestampSchema = z.string().datetime({ offset: true })
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const uuidSchema = z.string().uuid()

const remoteBaseSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: timestampSchema.nullable(),
})

export const remoteRowSchemas = {
  period: remoteBaseSchema.extend({
    type: z.enum(['monthly', 'biweekly']),
    start_date: dateOnlySchema,
    end_date: dateOnlySchema,
  }),
  income: remoteBaseSchema.extend({
    period_id: uuidSchema,
    amount: z.number().int().nonnegative().safe(),
    description: z.string(),
    date: dateOnlySchema,
  }),
  expense: remoteBaseSchema.extend({
    period_id: uuidSchema,
    category_id: uuidSchema,
    amount: z.number().int().nonnegative().safe(),
    description: z.string(),
    date: dateOnlySchema,
    recurring_occurrence_id: uuidSchema.nullable(),
  }),
  category: remoteBaseSchema.extend({
    name: z.string(),
    normalized_name: z.string(),
    color: z.string(),
    icon: z.string().nullable(),
    is_system: z.boolean(),
  }),
  categoryBudget: remoteBaseSchema.extend({
    period_id: uuidSchema,
    category_id: uuidSchema,
    amount: z.number().int().nonnegative().safe(),
  }),
  recurringPayment: remoteBaseSchema.extend({
    name: z.string(),
    amount: z.number().int().nonnegative().safe(),
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    due_date: dateOnlySchema,
    end_date: dateOnlySchema.nullable(),
    category_id: uuidSchema,
    status: z.enum(['active', 'inactive']),
  }),
  recurringPaymentOccurrence: remoteBaseSchema.extend({
    recurring_payment_id: uuidSchema,
    period_id: uuidSchema,
    due_date: dateOnlySchema,
    status: z.enum(['pending', 'paid', 'skipped']),
  }),
  userSettings: z.object({
    id: uuidSchema,
    user_id: uuidSchema,
    active_period_id: uuidSchema.nullable(),
    currency: z.string(),
    theme: z.enum(['light', 'dark', 'system']),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  }),
} as const

export const remoteMutationResultSchema = z.object({
  status: z.enum(['applied', 'already_processed', 'remote_wins']),
  entity_updated_at: timestampSchema.nullable(),
  related_entity_id: uuidSchema.nullable().optional(),
  related_updated_at: timestampSchema.nullable().optional(),
})

export const remotePageSchema = z.array(z.unknown())

export type RemoteMutationResultDto = z.infer<typeof remoteMutationResultSchema>
