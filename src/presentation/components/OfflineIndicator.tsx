import { useSync } from '../context/SyncContext'

export function OfflineIndicator() {
  const sync = useSync()
  if (sync.isOnline) return null
  return (
    <div className="offline-indicator" role="status" aria-live="polite">
      Sin conexión · Tus cambios siguen guardándose en este dispositivo
    </div>
  )
}
