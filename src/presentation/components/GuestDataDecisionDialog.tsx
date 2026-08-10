import { useState } from 'react'
import type { GuestDataDecision } from '../context/AuthContext'
import { useAuth } from '../context/AuthContext'

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
    <div className="dialog-backdrop">
      <section
        className="dialog guest-data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-data-title"
        aria-describedby="guest-data-description"
      >
        <h2 id="guest-data-title">Datos guardados en este dispositivo</h2>
        <p id="guest-data-description">
          Encontramos {count} registros del modo invitado. Elige explícitamente
          cómo manejarlos antes de continuar.
        </p>
        <div className="decision-actions">
          <button
            className="button"
            type="button"
            disabled={isPending}
            onClick={() => void decide('migrate-local')}
          >
            Migrar datos de este dispositivo
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={isPending}
            onClick={() => void decide('keep-account')}
          >
            Conservar datos de la cuenta
          </button>
          <button
            className="button danger"
            type="button"
            disabled={isPending}
            onClick={() => void decide('discard-local')}
          >
            Descartar datos locales
          </button>
          <button
            className="button ghost"
            type="button"
            disabled={isPending}
            onClick={() => void decide('cancel')}
          >
            Cancelar
          </button>
        </div>
        <p className="field-hint">
          La migración solo cambia el propietario local. Los datos todavía no se
          han sincronizado con la nube.
        </p>
      </section>
    </div>
  )
}
