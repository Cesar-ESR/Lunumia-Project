import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SyncContextValue } from '../context/SyncContext'
import { SyncStatusView } from './SyncStatusIndicator'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

function state(overrides: Partial<SyncContextValue> = {}): SyncContextValue {
  return {
    status: 'up_to_date',
    ownerId: OWNER_ID,
    pendingCount: 0,
    isOnline: true,
    isSyncing: false,
    lastAttemptAt: null,
    lastSuccessfulSyncAt: null,
    nextRetryAt: null,
    retryCount: 0,
    error: null,
    lastResult: null,
    canRetryManually: false,
    isAvailable: true,
    syncNow: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe('SyncStatusView', () => {
  it('expone estados accesibles sin detalles técnicos', () => {
    render(
      <SyncStatusView
        sync={state({
          status: 'error',
          canRetryManually: true,
          error: {
            kind: 'permission_denied',
            code: '42501',
            retryable: false,
            message: 'Tu sesión no tiene permiso para sincronizar estos datos.',
          },
        })}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tu sesión no tiene permiso para sincronizar estos datos.',
    )
    expect(screen.queryByText(/42501|technical/i)).not.toBeInTheDocument()
  })

  it('describe el modo offline y los cambios pendientes', () => {
    const { rerender } = render(
      <SyncStatusView
        sync={state({ status: 'offline', isOnline: false, pendingCount: 2 })}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sin conexión. Los cambios se guardan en este dispositivo.',
    )
    rerender(
      <SyncStatusView sync={state({ status: 'pending', pendingCount: 2 })} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('2 cambios pendientes')
  })

  it('permite reintentar manualmente sin exponer ownerId', async () => {
    const user = userEvent.setup()
    const syncNow = vi.fn().mockResolvedValue(null)
    render(
      <SyncStatusView
        sync={state({
          status: 'pending',
          pendingCount: 1,
          canRetryManually: true,
          syncNow,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Sincronizar ahora' }))
    expect(syncNow).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(OWNER_ID)).not.toBeInTheDocument()
  })

  it('se oculta en modo invitado o si Supabase no está configurado', () => {
    const { container, rerender } = render(
      <SyncStatusView sync={state({ ownerId: null })} />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(<SyncStatusView sync={state({ isAvailable: false })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
