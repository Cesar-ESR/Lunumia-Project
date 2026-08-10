import { z } from 'zod'
import { emailSchema } from './auth.schema'

export const forgotPasswordSchema = z.object({ email: emailSchema })
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>
