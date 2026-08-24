import type { ReactNode } from 'react'

export function InteractiveRow({
  leading,
  children,
  action,
  className = '',
}: {
  leading?: ReactNode
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <article className={`ln-interactive-row ${className}`.trim()}>
      {leading ? <div aria-hidden="true">{leading}</div> : null}
      <div className="ln-interactive-row__content">{children}</div>
      {action ? (
        <div className="ln-interactive-row__action">{action}</div>
      ) : null}
    </article>
  )
}
