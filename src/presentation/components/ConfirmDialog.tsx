import { useEffect, useRef, type ReactNode } from 'react'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  isPending = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  isPending?: boolean
  children?: ReactNode
  onConfirm(): void
  onCancel(): void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isPending, onCancel, open])
  if (!open) return null
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        {children}
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button ghost"
            disabled={isPending}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button danger"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
