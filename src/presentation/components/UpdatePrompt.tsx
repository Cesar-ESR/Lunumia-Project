import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { APP_NAME } from '@shared/constants'

export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  if (!offlineReady && !needRefresh) return null

  const dismiss = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
    setUpdateError(null)
  }

  const update = async () => {
    if (isUpdating) return
    setIsUpdating(true)
    setUpdateError(null)
    try {
      await updateServiceWorker(true)
    } catch {
      setUpdateError(
        'No se pudo actualizar ahora. Puedes continuar usando esta versión.',
      )
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <section className="pwa-prompt" role="status" aria-live="polite">
      <span>
        {needRefresh
          ? 'Nueva versión disponible.'
          : `${APP_NAME} está listo para usarse sin conexión.`}
      </span>
      {updateError ? <span role="alert">{updateError}</span> : null}
      <div>
        {needRefresh ? (
          <button
            className="button"
            type="button"
            disabled={isUpdating}
            onClick={() => void update()}
          >
            {isUpdating ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
        ) : null}
        <button
          className="button ghost"
          type="button"
          disabled={isUpdating}
          onClick={dismiss}
        >
          {needRefresh ? 'Más tarde' : 'Cerrar'}
        </button>
      </div>
    </section>
  )
}
