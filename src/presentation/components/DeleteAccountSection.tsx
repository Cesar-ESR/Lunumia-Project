import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOptionalAuth } from '../context/AuthContext'
import { ConfirmDialog } from './ConfirmDialog'
import { Notice } from './Notice'

export function DeleteAccountSection() {
  const auth = useOptionalAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!auth?.user) return null

  const close = () => {
    if (isPending) return
    setOpen(false)
    setConfirmation('')
    setError(null)
  }

  const confirm = async () => {
    setIsPending(true)
    setError(null)
    try {
      await auth.deleteAccount(confirmation)
      close()
      navigate('/', { replace: true })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No fue posible eliminar la cuenta.',
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <section
        className="panel settings-card danger-zone"
        aria-labelledby="delete-account-title"
      >
        <div>
          <p className="eyebrow">Zona de peligro</p>
          <h2 id="delete-account-title">Eliminar cuenta</h2>
        </div>
        <p>
          Elimina permanentemente tu identidad, tus datos remotos y la copia
          local asociada a esta cuenta. Esta acción no se puede deshacer.
        </p>
        <button
          className="button ghost danger-text"
          type="button"
          onClick={() => setOpen(true)}
        >
          Eliminar mi cuenta
        </button>
      </section>
      <ConfirmDialog
        open={open}
        title="Eliminar cuenta permanentemente"
        description="Esta acción elimina tu cuenta y todos sus datos. Escribe ELIMINAR para continuar."
        confirmLabel="Eliminar definitivamente"
        isPending={isPending}
        onConfirm={() => void confirm()}
        onCancel={close}
      >
        {error ? <Notice tone="error" message={error} /> : null}
        <div className="form-field">
          <label htmlFor="delete-account-confirmation">Confirmación</label>
          <input
            id="delete-account-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
