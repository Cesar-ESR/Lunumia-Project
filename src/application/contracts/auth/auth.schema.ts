import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'El correo es obligatorio.')
  .email('Escribe un correo válido.')
  .transform((value) => value.toLowerCase())
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
