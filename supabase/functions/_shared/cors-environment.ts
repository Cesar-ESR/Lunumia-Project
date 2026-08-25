import { readAllowedOrigins } from './environment.ts'

export const CANONICAL_ALLOWED_ORIGINS_ENV = 'ALLOWED_ORIGINS' as const
export const LEGACY_ALLOWED_ORIGIN_ENV = 'ALLOWED_ORIGIN' as const

export function readConfiguredAllowedOrigins(
  allowedOrigins: string | undefined,
  legacyAllowedOrigin: string | undefined,
): string[] {
  const canonical = hasOrigin(allowedOrigins) ? allowedOrigins : undefined
  return readAllowedOrigins([canonical ?? legacyAllowedOrigin]).filter(
    (origin) => origin !== '*',
  )
}

function hasOrigin(value: string | undefined): boolean {
  return (value ?? '').split(',').some((origin) => origin.trim().length > 0)
}
