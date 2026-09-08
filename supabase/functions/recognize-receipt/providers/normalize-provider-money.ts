export const PROVIDER_MONEY_FIELDS = [
  'subtotal',
  'tax',
  'tip',
  'discount',
  'otherFees',
  'total',
  'amountPaid',
] as const

/** Only the demonstrated comma-grouped variant is rewritten; no coercion. */
export function normalizeProviderMoneyString(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value === value.trim() &&
    /^-?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)
    ? value.replaceAll(',', '')
    : value
}

export function normalizeProviderMoneyFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const normalized = { ...value } as Record<string, unknown>
  for (const field of PROVIDER_MONEY_FIELDS) {
    if (Object.hasOwn(normalized, field))
      normalized[field] = normalizeProviderMoneyString(normalized[field])
  }
  return normalized
}
