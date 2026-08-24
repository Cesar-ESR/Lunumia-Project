import { Plus } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export function QuickActionButton({
  label = 'Registrar',
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label?: string
}) {
  return (
    <button
      {...props}
      type="button"
      className={`ln-quick-action ${className}`.trim()}
    >
      <Plus aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
