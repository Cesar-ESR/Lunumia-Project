import { z } from 'zod'
import { idSchema, nonNegativeCentsSchema } from './common.schema'
export const upsertCategoryBudgetSchema = z.object({
  ownerId: z.string().min(1),
  periodId: idSchema,
  categoryId: idSchema,
  amount: nonNegativeCentsSchema,
})

export const persistedCategoryBudgetSchema = upsertCategoryBudgetSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
  syncStatus: z.enum(['pending', 'synced', 'error']),
})
