import { useId, type ReactNode } from 'react'

export function AttentionBlock({
  heading,
  children,
  action,
  tone = 'info',
  headingLevel = 2,
  className = '',
}: {
  heading: string
  children: ReactNode
  action?: ReactNode
  tone?: 'info' | 'warning' | 'danger'
  headingLevel?: 2 | 3
  className?: string
}) {
  const headingId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <section
      className={`ln-attention-block ln-attention-block--${tone} ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <Heading id={headingId}>{heading}</Heading>
      <div>{children}</div>
      {action ? <div>{action}</div> : null}
    </section>
  )
}
