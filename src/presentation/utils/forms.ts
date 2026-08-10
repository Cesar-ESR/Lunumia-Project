import type { ZodError } from 'zod'

export type FieldErrors = Record<string, string>

function translateZodMessage(field: string, message: string): string {
  if (/uuid/i.test(message))
    return field.endsWith('Id')
      ? 'Selecciona una opción válida.'
      : 'El identificador no es válido.'
  if (/too small|greater than or equal to 1|>=1/i.test(message))
    return 'Este campo es obligatorio.'
  if (/too big|less than or equal|max/i.test(message))
    return 'El valor supera la longitud permitida.'
  if (/invalid.*(format|string)|does not match|regex|pattern/i.test(message))
    return field.toLowerCase().includes('date')
      ? 'Escribe una fecha válida.'
      : 'El formato no es válido.'
  if (/invalid option|invalid enum/i.test(message))
    return 'Selecciona una opción válida.'
  if (/expected number|invalid input/i.test(message))
    return 'Escribe un valor válido.'
  return message
}

export function zodFieldErrors(error: ZodError): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form')
    if (!errors[field])
      errors[field] = translateZodMessage(field, issue.message)
  }
  return errors
}

export function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return 'No pudimos completar la operación.'
  if (error.name === 'PeriodOverlapError')
    return 'Este periodo se superpone con otro periodo existente.'
  if (error.name === 'CategoryDuplicateError')
    return 'Ya existe una categoría con ese nombre.'
  if (error.name === 'SystemCategoryProtectedError')
    return 'La categoría del sistema no puede modificarse.'
  if (error.name === 'OccurrenceAlreadyPaidError')
    return 'Esta ocurrencia ya fue pagada.'
  return error.message || 'No pudimos completar la operación.'
}
