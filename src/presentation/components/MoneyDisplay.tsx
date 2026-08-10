import type { AmountCents, SignedMoneyCents } from '@domain/value-objects'
import { formatMoney } from '@shared/utils/money'

export function MoneyDisplay({
  amount,
  currency = 'MXN',
  className = '',
}: {
  amount: AmountCents | SignedMoneyCents
  currency?: string
  className?: string
}) {
  const formatted = formatMoney(amount, currency)
  return (
    <span
      className={className}
      aria-label={`${formatted}${amount < 0 ? ', valor negativo' : ''}`}
    >
      {formatted}
    </span>
  )
}
