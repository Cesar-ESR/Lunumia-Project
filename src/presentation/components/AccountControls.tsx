import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { useAuth } from '../context/AuthContext'

export function AccountControls() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [unresolvedCount, setUnresolvedCount] = useState<number | null>(null)
  const [deleteLocalDataOpen, setDeleteLocalDataOpen] = useState(false)
  const [deleteBlockedCount, setDeleteBlockedCount] = useState<number | null>(
    null,
  )
  const [isPending, setIsPending] = useState(false)

  if (!auth.user)
    return (
      <div className="account-controls guest-controls">
        <span>Modo invitado</span>
        <Link to="/login">Iniciar sesión</Link>
        <Link to="/register">Crear cuenta</Link>
      </div>
    )

  const requestSignOut = async () => {
    setIsPending(true)
    try {
      const result = await auth.signOut()
      if (result.requiresConfirmation)
        setUnresolvedCount(result.unresolvedCount)
      else navigate('/login', { replace: true })
    } finally {
      setIsPending(false)
    }
  }

  const confirmSignOut = async () => {
    setIsPending(true)
    try {
      await auth.signOut(true)
      setUnresolvedCount(null)
      navigate('/login', { replace: true })
    } finally {
      setIsPending(false)
    }
  }

  const confirmDeleteLocalData = async () => {
    setIsPending(true)
    try {
      const result = await auth.deleteLocalData()
      setDeleteLocalDataOpen(false)
      if (!result.deleted) {
        setDeleteBlockedCount(result.unresolvedCount)
        return
      }
      navigate('/login', { replace: true })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <div className="account-controls">
        <span>
          {auth.status === 'offline-authenticated'
            ? 'Cuenta · offline'
            : 'Cuenta'}
        </span>
        <strong>{auth.user.email}</strong>
        <button
          type="button"
          className="account-link"
          disabled={isPending}
          onClick={() => void requestSignOut()}
        >
          Cerrar sesión
        </button>
        <button
          type="button"
          className="account-link"
          disabled={isPending}
          onClick={() => {
            setDeleteBlockedCount(null)
            setDeleteLocalDataOpen(true)
          }}
        >
          Eliminar datos locales
        </button>
        {deleteBlockedCount !== null && (
          <span role="alert">
            No se pueden eliminar los datos locales porque hay{' '}
            {deleteBlockedCount} cambios sin sincronizar.
          </span>
        )}
      </div>
      <ConfirmDialog
        open={unresolvedCount !== null}
        title="Cambios sin sincronizar"
        description={`Tienes ${unresolvedCount ?? 0} cambios sin sincronizar. Puedes cerrar sesión, y los datos y la cola permanecerán guardados en este dispositivo para cuando vuelvas a entrar.`}
        confirmLabel="Cerrar sesión de todos modos"
        isPending={isPending}
        onConfirm={() => void confirmSignOut()}
        onCancel={() => setUnresolvedCount(null)}
      />
      <ConfirmDialog
        open={deleteLocalDataOpen}
        title="Eliminar datos locales"
        description="Esta acción elimina de este dispositivo todos los datos locales de la cuenta y cierra la sesión. No elimina la cuenta ni sus datos remotos. No se permitirá si hay cambios sin sincronizar."
        confirmLabel="Eliminar datos de este dispositivo"
        isPending={isPending}
        onConfirm={() => void confirmDeleteLocalData()}
        onCancel={() => setDeleteLocalDataOpen(false)}
      />
    </>
  )
}
