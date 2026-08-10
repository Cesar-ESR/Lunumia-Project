import { ZodError } from 'zod'

export function authFormErrors(reason: unknown): Record<string, string> {
  if (!(reason instanceof ZodError)) return {}
  return Object.fromEntries(
    reason.issues.map((issue) => [
      String(issue.path[0] ?? 'form'),
      issue.message,
    ]),
  )
}

export function authErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.includes('conexión'))
    return reason.message
  return fallback
}
