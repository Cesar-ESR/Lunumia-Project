import { z } from 'zod'
import { dateOnlySchema } from './common.schema'
export const createPeriodSchema = z.object({
  ownerId: z.string().min(1),
  type: z.enum(['monthly', 'biweekly']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
})
