import type { ReactNode } from 'react'

export function Notice({
  message,
  title,
  action,
  tone = 'success',
  role,
}: {
  message: ReactNode
  title?: string
  action?: ReactNode
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'error'
  role?: 'status' | 'alert'
}) {
  const semanticTone = tone === 'error' ? 'danger' : tone
  return (
    <div
      className={`ln-notice ln-notice--${semanticTone}`}
      role={role ?? (semanticTone === 'danger' ? 'alert' : 'status')}
      aria-live={semanticTone === 'danger' ? 'assertive' : 'polite'}
    >
      <div className="ln-notice__content">
        {title ? <strong className="ln-notice__title">{title}</strong> : null}
        <div className="ln-notice__body">{message}</div>
      </div>
      {action ? <div className="ln-notice__action">{action}</div> : null}
    </div>
  )
}
