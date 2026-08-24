import type { ReactNode } from 'react'

export type MetricBlockState = 'known' | 'unknown' | 'negative' | 'loading'

export function MetricBlock({
  label,
  value,
  supporting,
  status,
  variant = 'supporting',
  state = 'known',
  className = '',
}: {
  label: string
  value: ReactNode
  supporting?: ReactNode
  status?: ReactNode
  variant?: 'primary' | 'supporting'
  state?: MetricBlockState
  className?: string
}) {
  return (
    <div
      className={`ln-metric-block ln-metric-block--${variant} ln-metric-block--${state} ${className}`.trim()}
      aria-busy={state === 'loading' || undefined}
    >
      <span className="ln-metric-block__label">{label}</span>
      <strong className="ln-metric-block__value">{value}</strong>
      {supporting ? (
        <span className="ln-metric-block__supporting">{supporting}</span>
      ) : null}
      {status ? (
        <span className="ln-metric-block__status">{status}</span>
      ) : null}
    </div>
  )
}
