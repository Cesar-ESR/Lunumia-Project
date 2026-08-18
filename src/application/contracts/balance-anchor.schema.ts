import { z } from 'zod'
import { signedCentsSchema } from './common.schema'

export const setCurrentBalanceSchema = z.object({
  ownerId: z.string().min(1),
  amount: signedCentsSchema,
})
