import { z } from 'zod'
import { passwordSchema } from './auth.schema'

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['passwordConfirmation'],
  })

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>
