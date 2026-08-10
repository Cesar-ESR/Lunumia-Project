import { z } from 'zod'
import { dateOnlySchema, idSchema, positiveCentsSchema } from './common.schema'
export const createExpenseSchema = z.object({
  ownerId: z.string().min(1),
  periodId: idSchema,
  categoryId: idSchema,
  amount: positiveCentsSchema,
  description: z.string().trim().min(1).max(200),
  date: dateOnlySchema,
})
