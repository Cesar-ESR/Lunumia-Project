export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000

export function readProviderTimeout(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_PROVIDER_TIMEOUT_MS)
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 60_000
    ? parsed
    : DEFAULT_PROVIDER_TIMEOUT_MS
}

export function readAllowedOrigins(values: readonly (string | undefined)[]) {
  const configured = values
    .flatMap((value) => (value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  return [
    ...new Set([
      'https://localhost',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      ...configured,
    ]),
  ]
}
