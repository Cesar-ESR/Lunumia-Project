import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { SyncResult } from '@application/services/SyncCoordinator'
import type {
  SyncOrchestrator,
  SyncState,
} from '@application/services/SyncOrchestrator'
import { useAuth } from './AuthContext'

export interface SyncContextValue extends SyncState {
  isAvailable: boolean
  syncNow(): Promise<SyncResult | null>
}

const UNAVAILABLE_STATE: SyncState = {
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

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({
  orchestrator,
  children,
}: {
  orchestrator: SyncOrchestrator | null
  children: ReactNode
}) {
  const auth = useAuth()
  const synchronizableOwnerId = auth.user ? auth.ownerId : null
  const revalidatedAttempt = useRef<string | null>(null)
  const authRecoveryCount = useRef(0)
  const previousAuthStatus = useRef(auth.status)
  const subscribe = useCallback(
    (listener: () => void) =>
      orchestrator?.subscribe(listener) ?? (() => undefined),
    [orchestrator],
  )
  const getSnapshot = useCallback(
    () => orchestrator?.getState() ?? UNAVAILABLE_STATE,
    [orchestrator],
  )
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    authRecoveryCount.current = 0
    revalidatedAttempt.current = null
    orchestrator?.start(synchronizableOwnerId)
    return () => orchestrator?.stop()
  }, [orchestrator, synchronizableOwnerId])

  useEffect(() => {
    if (!orchestrator) return
    const wasRevalidating = previousAuthStatus.current === 'revalidating'
    previousAuthStatus.current = auth.status
    if (auth.status === 'loading' || auth.status === 'revalidating') {
      orchestrator.pause()
      return
    }
    orchestrator.resume()
    if (wasRevalidating && auth.status === 'authenticated')
      void orchestrator.syncNow()
  }, [auth.status, orchestrator])

  useEffect(() => {
    if (state.status === 'up_to_date') {
      authRecoveryCount.current = 0
      revalidatedAttempt.current = null
    }
    if (state.error?.kind !== 'unauthenticated') {
      return
    }
    const attempt = state.lastAttemptAt
    if (
      attempt &&
      revalidatedAttempt.current !== attempt &&
      authRecoveryCount.current === 0
    ) {
      authRecoveryCount.current += 1
      revalidatedAttempt.current = attempt
      orchestrator?.pause()
      void auth.revalidateSession().then((outcome) => {
        if (outcome === 'signed-out') return
        orchestrator?.resume()
        if (outcome === 'authenticated') void orchestrator?.syncNow()
      })
    }
  }, [auth, orchestrator, state.error?.kind, state.lastAttemptAt, state.status])

  const syncNow = useCallback(
    () => orchestrator?.syncNow() ?? Promise.resolve(null),
    [orchestrator],
  )
  const value = useMemo<SyncContextValue>(
    () => ({ ...state, isAvailable: orchestrator !== null, syncNow }),
    [orchestrator, state, syncNow],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const context = useContext(SyncContext)
  if (!context) throw new Error('useSync debe usarse dentro de SyncProvider.')
  return context
}
