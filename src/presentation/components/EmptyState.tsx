import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="state-card empty-state">
      <div className="state-icon" aria-hidden="true">
        ○
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  )
}
