import type { SyncContextValue } from '../context/SyncContext'
import { useSync } from '../context/SyncContext'

export function SyncStatusIndicator() {
  return <SyncStatusView sync={useSync()} />
}

export function SyncStatusView({ sync }: { sync: SyncContextValue }) {
  if (!sync.isAvailable || !sync.ownerId || sync.status === 'idle') return null

  const message = getStatusMessage(sync)
  const showAction =
    !sync.isSyncing &&
    sync.isOnline &&
    (sync.status === 'pending' ||
      (sync.status === 'error' && sync.canRetryManually))

  return (
    <section
      className={'ln-sync-status ln-sync-status--' + sync.status}
      role="status"
      aria-live="polite"
      aria-busy={sync.isSyncing}
    >
      <span className="ln-sync-status__mark" aria-hidden="true" />
      <span>{message}</span>
      {showAction ? (
        <button
          className="ln-sync-status__action"
          type="button"
          onClick={() => void sync.syncNow()}
        >
          Sincronizar ahora
        </button>
      ) : null}
    </section>
  )
}

function getStatusMessage(sync: SyncContextValue): string {
  switch (sync.status) {
    case 'offline':
      return 'Sin conexión. Los cambios se guardan en este dispositivo.'
    case 'pending':
      return (
        String(sync.pendingCount) +
        (sync.pendingCount === 1
          ? ' cambio pendiente.'
          : ' cambios pendientes.')
      )
    case 'syncing':
      return 'Sincronizando…'
    case 'up_to_date':
      return 'Todo sincronizado.'
    case 'error':
      return (
        sync.error?.message ?? 'No fue posible completar la sincronización.'
      )
    case 'idle':
      return ''
  }
}
