import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'link'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    loading?: boolean
    loadingLabel?: string
    children: ReactNode
  }
>(function Button(
  {
    variant = 'primary',
    loading = false,
    loadingLabel = 'Procesando…',
    className = '',
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`ln-button ln-button--${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? loadingLabel : children}
    </button>
  )
})
