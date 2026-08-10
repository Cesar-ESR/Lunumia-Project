import { z } from 'zod'
export const createCategorySchema = z.object({
  ownerId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().trim().max(80).nullable().optional(),
})
