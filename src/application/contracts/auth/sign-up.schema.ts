import { z } from 'zod'
import { emailSchema, passwordSchema } from './auth.schema'

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['passwordConfirmation'],
  })

export type SignUpInput = z.input<typeof signUpSchema>
export type ValidSignUpInput = z.output<typeof signUpSchema>
