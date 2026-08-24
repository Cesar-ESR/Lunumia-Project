import { createElement, type ReactNode } from 'react'

export type SurfaceVariant = 'base' | 'subtle' | 'elevated'

export function Surface({
  as = 'section',
  variant = 'base',
  className = '',
  children,
  ...props
}: {
  as?: 'div' | 'section' | 'article'
  variant?: SurfaceVariant
  className?: string
  children: ReactNode
} & Record<string, unknown>) {
  return createElement(
    as,
    {
      ...props,
      className: `ln-surface ln-surface--${variant} ${className}`.trim(),
    },
    children,
  )
}
