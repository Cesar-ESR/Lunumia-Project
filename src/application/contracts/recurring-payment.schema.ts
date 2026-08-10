import { z } from 'zod'
import { dateOnlySchema, idSchema, positiveCentsSchema } from './common.schema'

export const createRecurringPaymentSchema = z
  .object({
    ownerId: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    amount: positiveCentsSchema,
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    dueDate: dateOnlySchema,
    endDate: dateOnlySchema.nullable().default(null),
    categoryId: idSchema,
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .superRefine((value, context) => {
    if (value.endDate !== null && value.endDate < value.dueDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message:
          'La fecha final debe ser igual o posterior a la fecha inicial.',
      })
    }
  })
