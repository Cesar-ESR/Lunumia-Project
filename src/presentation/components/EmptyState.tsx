import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
}: {
  title: string
  description: string
  icon?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
}) {
  return (
    <section className="ln-state ln-state--empty">
      {icon ? (
        <div className="ln-state__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action || secondaryAction ? (
        <div className="ln-state__actions">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  )
}
