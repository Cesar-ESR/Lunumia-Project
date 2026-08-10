import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SyncOrchestrator,
  SyncState,
} from '@application/services/SyncOrchestrator'
import { useAuth } from './AuthContext'
import { SyncProvider, useSync } from './SyncContext'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

class FakeOrchestrator {
  state: SyncState = {
    status: 'idle',
    ownerId: null,
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
  }
  readonly start = vi.fn()
  readonly stop = vi.fn()
  readonly pause = vi.fn()
  readonly resume = vi.fn()
  readonly syncNow = vi.fn().mockResolvedValue(null)
  private readonly listeners = new Set<(state: SyncState) => void>()
  getState = () => this.state
  subscribe = (listener: (state: SyncState) => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(state: SyncState) {
    this.state = state
    this.listeners.forEach((listener) => listener(state))
  }
}

function Consumer() {
  const sync = useSync()
  return <span>{sync.status}</span>
}

describe('SyncProvider', () => {
  const revalidateSession = vi.fn().mockResolvedValue('authenticated')

  beforeEach(() => {
    revalidateSession.mockClear()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: OWNER_ID },
      ownerId: OWNER_ID,
      status: 'authenticated',
      revalidateSession,
    } as never)
  })

  it('inicia con el usuario autenticado y limpia al desmontar', () => {
    const orchestrator = new FakeOrchestrator()
    const { unmount } = render(
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>,
    )
    expect(orchestrator.start).toHaveBeenCalledWith(OWNER_ID)
    unmount()
    expect(orchestrator.stop).toHaveBeenCalledTimes(1)
  })

  it('detiene el owner autenticado y cambia a contexto sin sync al cerrar sesión', () => {
    const orchestrator = new FakeOrchestrator()
    const view = (
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>
    )
    const { rerender } = render(view)
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      ownerId: 'guest:local',
      status: 'guest',
      revalidateSession,
    } as never)
    rerender(
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>,
    )

    expect(orchestrator.stop).toHaveBeenCalledOnce()
    expect(orchestrator.start).toHaveBeenLastCalledWith(null)
  })

  it('TOKEN_REFRESHED mantiene activo el mismo SyncCoordinator', () => {
    const orchestrator = new FakeOrchestrator()
    const view = (
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>
    )
    const { rerender } = render(view)
    vi.mocked(useAuth).mockReturnValue({
      user: { id: OWNER_ID, email: 'persona@example.com' },
      ownerId: OWNER_ID,
      status: 'authenticated',
      revalidateSession,
    } as never)
    rerender(
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>,
    )
    expect(orchestrator.start).toHaveBeenCalledOnce()
    expect(orchestrator.stop).not.toHaveBeenCalled()
  })

  it('foreground pausa sync y solo lo reanuda después de revalidar', async () => {
    const orchestrator = new FakeOrchestrator()
    const renderProvider = () => (
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>
    )
    const { rerender } = render(renderProvider())
    vi.mocked(useAuth).mockReturnValue({
      user: { id: OWNER_ID },
      ownerId: OWNER_ID,
      status: 'revalidating',
      revalidateSession,
    } as never)
    rerender(renderProvider())
    expect(orchestrator.pause).toHaveBeenCalled()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: OWNER_ID },
      ownerId: OWNER_ID,
      status: 'authenticated',
      revalidateSession,
    } as never)
    rerender(renderProvider())
    await waitFor(() => expect(orchestrator.syncNow).toHaveBeenCalledOnce())
    expect(orchestrator.resume).toHaveBeenCalled()
  })

  it('revalida una sesión antes de reintentar un 401 y no la invalida', async () => {
    const orchestrator = new FakeOrchestrator()
    render(
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>,
    )
    const state: SyncState = {
      ...orchestrator.state,
      status: 'error',
      ownerId: OWNER_ID,
      lastAttemptAt: '2026-08-01T12:00:00.000Z',
      error: {
        kind: 'unauthenticated',
        code: 'PGRST301',
        retryable: true,
        message: 'La sesión requiere revalidación.',
      },
      canRetryManually: true,
    }
    orchestrator.emit(state)
    orchestrator.emit({ ...state })
    await waitFor(() => expect(revalidateSession).toHaveBeenCalledTimes(1))
    expect(orchestrator.pause).toHaveBeenCalled()
    expect(orchestrator.resume).toHaveBeenCalled()
    expect(orchestrator.syncNow).toHaveBeenCalledOnce()
    orchestrator.emit({
      ...state,
      lastAttemptAt: '2026-08-01T12:00:01.000Z',
    })
    await Promise.resolve()
    expect(revalidateSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText('error')).toBeInTheDocument()
  })

  it('un fallo retryable de refresh conserva owner y respeta el backoff', async () => {
    revalidateSession.mockResolvedValueOnce('retryable-failure')
    const orchestrator = new FakeOrchestrator()
    render(
      <SyncProvider orchestrator={orchestrator as unknown as SyncOrchestrator}>
        <Consumer />
      </SyncProvider>,
    )
    orchestrator.emit({
      ...orchestrator.state,
      status: 'error',
      ownerId: OWNER_ID,
      lastAttemptAt: '2026-08-01T12:01:00.000Z',
      error: {
        kind: 'unauthenticated',
        code: 'PGRST301',
        retryable: true,
        message: 'La sesión requiere revalidación.',
      },
    })
    await waitFor(() => expect(revalidateSession).toHaveBeenCalledOnce())
    expect(orchestrator.resume).toHaveBeenCalled()
    expect(orchestrator.syncNow).not.toHaveBeenCalled()
    expect(orchestrator.start).toHaveBeenLastCalledWith(OWNER_ID)
  })
})
