export function parseMoneyInputToCents(
  value: string,
  allowZero = false,
): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [wholePart, decimalPart = ''] = normalized.split('.')
  const whole = Number(wholePart)
  const decimal = Number(decimalPart.padEnd(2, '0'))
  const cents = whole * 100 + decimal
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0))
    return null
  return cents
}

export function formatCentsForInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}
