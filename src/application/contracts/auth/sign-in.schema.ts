import { z } from 'zod'
import { emailSchema, passwordSchema } from './auth.schema'

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type SignInInput = z.input<typeof signInSchema>
export type ValidSignInInput = z.output<typeof signInSchema>
