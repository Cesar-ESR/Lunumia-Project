export function parseMoneyInputToCents(
  value: string,
  allowZero = false,
  allowNegative = false,
): number | null {
  const normalized = value.trim().replace(',', '.')
  const pattern = allowNegative
    ? /^-?\d+(?:\.\d{1,2})?$/
    : /^\d+(?:\.\d{1,2})?$/
  if (!pattern.test(normalized)) return null
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [wholePart, decimalPart = ''] = unsigned.split('.')
  const whole = Number(wholePart)
  const decimal = Number(decimalPart.padEnd(2, '0'))
  const absoluteCents = whole * 100 + decimal
  const cents = negative ? -absoluteCents : absoluteCents
  if (
    !Number.isSafeInteger(cents) ||
    (!allowNegative && cents < 0) ||
    (!allowZero && cents === 0)
  )
    return null
  return cents
}

export function formatCentsForInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}
