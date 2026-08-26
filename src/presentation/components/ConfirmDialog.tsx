import { useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  isPending = false,
  destructive = true,
  children,
  onConfirm,
  onCancel,
  getPostCloseFocusTarget,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  isPending?: boolean
  destructive?: boolean
  children?: ReactNode
  onConfirm(): void
  onCancel(): void
  getPostCloseFocusTarget?: () => HTMLElement | null
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      initialFocusRef={cancelRef}
      getPostCloseFocusTarget={getPostCloseFocusTarget}
      pending={isPending}
      actions={
        <>
          <Button
            ref={cancelRef}
            variant="ghost"
            disabled={isPending}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={isPending}
            loadingLabel="Procesando…"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
