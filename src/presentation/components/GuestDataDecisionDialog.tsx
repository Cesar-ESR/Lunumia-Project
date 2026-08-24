import { useState } from 'react'
import type { GuestDataDecision } from '../context/AuthContext'
import { useAuth } from '../context/AuthContext'
import { Button } from './Button'
import { Dialog } from './Dialog'

export function GuestDataDecisionDialog() {
  const { pendingGuestData, resolveGuestData } = useAuth()
  const [isPending, setIsPending] = useState(false)
  if (!pendingGuestData) return null

  const decide = async (decision: GuestDataDecision) => {
    setIsPending(true)
    try {
      await resolveGuestData(decision)
    } finally {
      setIsPending(false)
    }
  }

  const count = Object.entries(pendingGuestData.summary)
    .filter(([key]) => key !== 'hasData')
    .reduce((total, [, value]) => total + Number(value), 0)

  return (
    <Dialog
      open
      title="Datos guardados en este dispositivo"
      description={`Encontramos ${count} registros del modo invitado. Elige explícitamente cómo manejarlos antes de continuar.`}
      className="guest-data-dialog"
      pending={isPending}
      closeOnEscape={!isPending}
      onClose={() => void decide('cancel')}
      actions={
        <div className="decision-actions">
          <Button
            disabled={isPending}
            onClick={() => void decide('migrate-local')}
          >
            Migrar datos de este dispositivo
          </Button>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => void decide('keep-account')}
          >
            Conservar datos de la cuenta
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => void decide('discard-local')}
          >
            Descartar datos locales
          </Button>
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => void decide('cancel')}
          >
            Cancelar
          </Button>
        </div>
      }
    >
      <p className="field-hint">
        La migración solo cambia el propietario local. Los datos todavía no se
        han sincronizado con la nube.
      </p>
    </Dialog>
  )
}
