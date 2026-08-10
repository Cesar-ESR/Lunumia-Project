import type { AmountCents, SignedMoneyCents } from '@domain/value-objects'

export const DEFAULT_CURRENCY = 'MXN'
export const MONEY_LOCALE = 'es-MX'

export function formatMoney(
  amount: AmountCents | SignedMoneyCents,
  currency = DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat(MONEY_LOCALE, {
    style: 'currency',
    currency,
  }).format(amount / 100)
}
