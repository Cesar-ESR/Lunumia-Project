import { useId, useState } from 'react'
import type { GuestDataDecision } from '../context/AuthContext'
import { useAuth } from '../context/AuthContext'
import { Button } from './Button'
import { Dialog } from './Dialog'

export function GuestDataDecisionDialog() {
  const { pendingGuestData, resolveGuestData } = useAuth()
  const [isPending, setIsPending] = useState(false)
  const helpId = useId()
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
      description={`Encontramos ${count} registros creados como invitado. Elige qué quieres hacer con ellos.`}
      className="guest-data-dialog"
      pending={isPending}
      closeOnEscape={!isPending}
      onClose={() => void decide('cancel')}
      actions={
        <div className="decision-actions">
          <div className="guest-data-decision">
            <Button
              aria-describedby={`${helpId}-migrate`}
              disabled={isPending}
              onClick={() => void decide('migrate-local')}
            >
              Usar estos datos en mi cuenta
            </Button>
            <p id={`${helpId}-migrate`} className="field-hint">
              Los {count} registros de este dispositivo se añadirán a tu cuenta.
            </p>
          </div>
          <div className="guest-data-decision">
            <Button
              aria-describedby={`${helpId}-keep`}
              variant="secondary"
              disabled={isPending}
              onClick={() => void decide('keep-account')}
            >
              Usar los datos de mi cuenta
            </Button>
            <p id={`${helpId}-keep`} className="field-hint">
              Ignoraremos estos datos locales y mantendremos los datos que ya
              tiene tu cuenta.
            </p>
          </div>
          <div className="guest-data-decision">
            <Button
              aria-describedby={`${helpId}-discard`}
              variant="danger"
              disabled={isPending}
              onClick={() => void decide('discard-local')}
            >
              Eliminar estos datos del dispositivo
            </Button>
            <p id={`${helpId}-discard`} className="field-hint">
              Se eliminarán permanentemente los {count} registros locales.
            </p>
          </div>
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
        Si eliges usar estos datos en tu cuenta, se prepararán para
        sincronizarse con tus otros dispositivos.
      </p>
    </Dialog>
  )
}
