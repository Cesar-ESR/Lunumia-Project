import { z } from 'zod'
import { idSchema, nonNegativeCentsSchema } from './common.schema'
export const upsertCategoryBudgetSchema = z.object({
  ownerId: z.string().min(1),
  periodId: idSchema,
  categoryId: idSchema,
  amount: nonNegativeCentsSchema,
})
