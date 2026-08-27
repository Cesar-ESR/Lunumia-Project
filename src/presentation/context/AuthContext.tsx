import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  ForgotPasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
} from '@application/contracts/auth'
import {
  AuthClientError,
  type AuthResult,
  type AuthSession,
  type AuthStatus,
  type AuthUser,
} from '@application/services/AuthClient'
import type { GuestDataSummary } from '@application/services/DataMigrationService'
import type { AuthRuntime } from '../../app/composition-root'

export type GuestDataDecision =
  'keep-account' | 'migrate-local' | 'discard-local' | 'cancel'

export interface PendingGuestDataDecision {
  sourceOwnerId: string
  targetOwnerId: string
  reason: 'register' | 'login'
  summary: GuestDataSummary
}

export interface SignOutResult {
  requiresConfirmation: boolean
  unresolvedCount: number
}

export interface DeleteLocalDataResult {
  deleted: boolean
  unresolvedCount: number
}

export interface AuthActionResult extends AuthResult {
  requiresGuestDecision: boolean
}

export type SessionRevalidationResult =
  'authenticated' | 'retryable-failure' | 'signed-out'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  session: AuthSession | null
  ownerId: string
  isConfigured: boolean
  error: string | null
  message: string | null
  pendingGuestData: PendingGuestDataDecision | null
  signUp(input: SignUpInput): Promise<AuthActionResult>
  signIn(input: SignInInput): Promise<AuthActionResult>
  signOut(force?: boolean): Promise<SignOutResult>
  deleteLocalData(): Promise<DeleteLocalDataResult>
  deleteAccount(confirmation: string): Promise<void>
  requestPasswordReset(input: ForgotPasswordInput): Promise<void>
  updatePassword(input: ResetPasswordInput): Promise<void>
  revalidateSession(): Promise<SessionRevalidationResult>
  resolveGuestData(decision: GuestDataDecision): Promise<void>
  clearMessage(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function logAuth(message: string): void {
  if (import.meta.env.DEV) console.info(`[auth] ${message}`)
}

export function AuthProvider({
  runtime,
  guestOwnerId,
  children,
}: {
  runtime: AuthRuntime | null
  guestOwnerId: string
  children: ReactNode
}) {
  const [status, setStatus] = useState<AuthStatus>(
    runtime ? 'loading' : 'guest',
  )
  const [session, setSession] = useState<AuthSession | null>(null)
  const [ownerId, setOwnerId] = useState(guestOwnerId)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingGuestData, setPendingGuestData] =
    useState<PendingGuestDataDecision | null>(null)
  const navigate = useNavigate()
  const actionInProgress = useRef(false)
  const sessionRef = useRef<AuthSession | null>(null)
  const revalidationRef = useRef<Promise<SessionRevalidationResult> | null>(
    null,
  )
  const pendingGuestDataRef = useRef<PendingGuestDataDecision | null>(null)

  const commitSession = useCallback((nextSession: AuthSession | null) => {
    sessionRef.current = nextSession
    setSession(nextSession)
  }, [])

  const transitionToGuest = useCallback(
    (activateStoredGuest = false) => {
      if (!runtime) return
      const nextGuestOwnerId = activateStoredGuest
        ? runtime.ownerStore.activateGuest()
        : guestOwnerId
      commitSession(null)
      setStatus('guest')
      setOwnerId(nextGuestOwnerId)
      pendingGuestDataRef.current = null
      setPendingGuestData(null)
    },
    [commitSession, guestOwnerId, runtime],
  )

  const applySession = useCallback(
    (nextSession: AuthSession) => {
      if (!runtime) return
      commitSession(nextSession)
      setStatus(navigator.onLine ? 'authenticated' : 'offline-authenticated')
      if (pendingGuestDataRef.current?.targetOwnerId === nextSession.user.id)
        return
      setOwnerId(nextSession.user.id)
      runtime.ownerStore.setActive(nextSession.user.id)
      logAuth('session-presence=true')
    },
    [commitSession, runtime],
  )

  const restoreSession =
    useCallback(async (): Promise<SessionRevalidationResult> => {
      if (!runtime) {
        setStatus('guest')
        return 'signed-out'
      }
      if (!sessionRef.current) setStatus('loading')
      setError(null)
      try {
        const restored = await runtime.sessionManager.restore(
          navigator.onLine,
          (id) => runtime.cleaner.hasLocalData(id),
        )
        if (restored.session) {
          applySession(restored.session)
          return 'authenticated'
        }
        if (!sessionRef.current) transitionToGuest()
        return sessionRef.current ? 'authenticated' : 'signed-out'
      } catch (reason) {
        if (sessionRef.current) setStatus('offline-authenticated')
        else setStatus('revalidating')
        setError(
          navigator.onLine
            ? 'No fue posible restaurar la sesión.'
            : 'Sin conexión. La sesión se conservará hasta poder revalidarla.',
        )
        logAuth(
          `revalidate=failure session-presence=${sessionRef.current !== null} error-code=${reason instanceof AuthClientError ? (reason.code ?? reason.kind) : 'unexpected'}`,
        )
        return 'retryable-failure'
      }
    }, [applySession, runtime, transitionToGuest])

  const revalidateSession =
    useCallback((): Promise<SessionRevalidationResult> => {
      if (!runtime) return Promise.resolve('signed-out')
      if (revalidationRef.current) return revalidationRef.current
      const operation = (async (): Promise<SessionRevalidationResult> => {
        const previousSession = sessionRef.current
        if (!previousSession) return restoreSession()
        setStatus('revalidating')
        setError(null)
        logAuth('revalidate=start')
        try {
          const nextSession = await runtime.authClient.revalidateSession()
          if (nextSession.user.id !== previousSession.user.id)
            throw new AuthClientError(
              'session-invalid',
              'La identidad de la sesión cambió durante la revalidación.',
              'session_identity_changed',
            )
          applySession(nextSession)
          logAuth('revalidate=success session-presence=true')
          return 'authenticated'
        } catch (reason) {
          if (
            reason instanceof AuthClientError &&
            reason.kind === 'session-invalid'
          ) {
            actionInProgress.current = true
            try {
              await runtime.authClient.clearLocalSession()
            } catch {
              // La sesión ya fue declarada inválida; el estado local no debe revivirla.
            } finally {
              actionInProgress.current = false
            }
            transitionToGuest(true)
            setError('Tu sesión terminó. Inicia sesión nuevamente.')
            logAuth(
              `revalidate=failure session-presence=false error-code=${reason.code ?? reason.kind}`,
            )
            return 'signed-out'
          }
          commitSession(previousSession)
          setStatus('offline-authenticated')
          setError(
            'No fue posible revalidar la sesión. Se conservarán tu cuenta y tus datos mientras se reintenta.',
          )
          logAuth(
            `revalidate=failure session-presence=true error-code=${reason instanceof AuthClientError ? (reason.code ?? reason.kind) : 'unexpected'}`,
          )
          return 'retryable-failure'
        }
      })()
      revalidationRef.current = operation
      void operation.finally(() => {
        if (revalidationRef.current === operation)
          revalidationRef.current = null
      })
      return operation
    }, [
      applySession,
      commitSession,
      restoreSession,
      runtime,
      transitionToGuest,
    ])

  useEffect(() => {
    if (!runtime) return
    let active = true
    if (!runtime.authSessionLifecycle)
      queueMicrotask(() => {
        if (active) void restoreSession()
      })
    const unsubscribe = runtime.sessionManager.subscribe((change) => {
      if (!active || actionInProgress.current) return
      const eventLabel = change.event.replaceAll('-', '_').toUpperCase()
      logAuth(`event=${eventLabel} session-presence=${change.session !== null}`)
      if (change.event === 'signed-out') {
        transitionToGuest(true)
        return
      }
      if (change.event === 'initial-session' && !change.session) {
        // restoreSession decide startup limpio; un null transitorio nunca degrada
        // una identidad que la aplicación ya conoce.
        return
      }
      if (change.event === 'initial-session' && runtime.authSessionLifecycle)
        return
      if (change.session) applySession(change.session)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [applySession, restoreSession, runtime, transitionToGuest])

  useEffect(() => {
    if (!runtime?.authSessionLifecycle) return
    return runtime.authSessionLifecycle.start({
      onForeground: async () => {
        await revalidateSession()
      },
    })
  }, [revalidateSession, runtime])

  useEffect(() => {
    if (!runtime?.authCallbacks) return
    return runtime.authCallbacks.start({
      onSuccess: (nextSession, destination) => {
        setError(null)
        setMessage('La autenticación se completó correctamente.')
        void applySession(nextSession)
        navigate(destination, { replace: true })
      },
      onError: (callbackError) => {
        setError(callbackError)
        navigate('/login', { replace: true })
      },
    })
  }, [applySession, navigate, runtime])

  useEffect(() => {
    if (!runtime) return
    const updateNetworkStatus = () => {
      const currentSession = sessionRef.current
      if (!currentSession) return
      if (navigator.onLine) void revalidateSession()
      else setStatus('offline-authenticated')
    }
    window.addEventListener('online', updateNetworkStatus)
    window.addEventListener('offline', updateNetworkStatus)
    return () => {
      window.removeEventListener('online', updateNetworkStatus)
      window.removeEventListener('offline', updateNetworkStatus)
    }
  }, [revalidateSession, runtime])

  const prepareAuthenticatedSession = useCallback(
    async (
      nextSession: AuthSession,
      reason: 'register' | 'login',
    ): Promise<boolean> => {
      if (!runtime) return false
      const summary = await runtime.migration.summarize(guestOwnerId)
      commitSession(nextSession)
      setStatus('authenticated')
      if (summary.hasData) {
        const pending = {
          sourceOwnerId: guestOwnerId,
          targetOwnerId: nextSession.user.id,
          reason,
          summary,
        }
        pendingGuestDataRef.current = pending
        setPendingGuestData(pending)
        setOwnerId(guestOwnerId)
        return true
      }
      setOwnerId(nextSession.user.id)
      runtime.ownerStore.setActive(nextSession.user.id)
      return false
    },
    [commitSession, guestOwnerId, runtime],
  )

  const signUp = useCallback(
    async (input: SignUpInput) => {
      if (!runtime) throw new Error('Configura Supabase para crear una cuenta.')
      actionInProgress.current = true
      setError(null)
      try {
        const result = await runtime.signUp.execute(
          input,
          runtime.redirectUrl('/verify-email'),
          runtime.redirectUrl('/reset-password'),
        )
        const requiresGuestDecision = result.session
          ? await prepareAuthenticatedSession(result.session, 'register')
          : false
        return { ...result, requiresGuestDecision }
      } finally {
        actionInProgress.current = false
      }
    },
    [prepareAuthenticatedSession, runtime],
  )

  const signIn = useCallback(
    async (input: SignInInput) => {
      if (!runtime) throw new Error('Configura Supabase para iniciar sesión.')
      actionInProgress.current = true
      setError(null)
      try {
        const result = await runtime.signIn.execute(input)
        if (!result.session)
          throw new Error(
            'No fue posible iniciar sesión. Revisa tus datos e inténtalo nuevamente.',
          )
        const requiresGuestDecision = await prepareAuthenticatedSession(
          result.session,
          'login',
        )
        return { ...result, requiresGuestDecision }
      } finally {
        actionInProgress.current = false
      }
    },
    [prepareAuthenticatedSession, runtime],
  )

  const resolveGuestData = useCallback(
    async (decision: GuestDataDecision) => {
      if (!runtime || !pendingGuestData || !session) return
      actionInProgress.current = true
      setError(null)
      try {
        if (decision === 'cancel') {
          await runtime.authClient.signOut()
          commitSession(null)
          setStatus('guest')
          setOwnerId(pendingGuestData.sourceOwnerId)
          pendingGuestDataRef.current = null
          setPendingGuestData(null)
          return
        }
        if (decision === 'migrate-local') {
          await runtime.migration.migrate(
            pendingGuestData.sourceOwnerId,
            pendingGuestData.targetOwnerId,
          )
          setMessage(
            'Tus datos quedaron asociados a tu cuenta en este dispositivo. La sincronización con la nube se completará después.',
          )
        } else if (decision === 'discard-local') {
          await runtime.cleaner.deleteOwner(pendingGuestData.sourceOwnerId)
          setMessage(
            'Los datos invitados de este dispositivo fueron eliminados.',
          )
        } else {
          runtime.ownerStore.setActive(pendingGuestData.targetOwnerId)
          setMessage(
            'Se conservaron separados los datos de la cuenta y los datos invitados del dispositivo.',
          )
        }
        setOwnerId(pendingGuestData.targetOwnerId)
        setStatus('authenticated')
        pendingGuestDataRef.current = null
        setPendingGuestData(null)
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'No se pudo completar la decisión sobre los datos locales.',
        )
        throw reason
      } finally {
        actionInProgress.current = false
      }
    },
    [commitSession, pendingGuestData, runtime, session],
  )

  const signOut = useCallback(
    async (force = false): Promise<SignOutResult> => {
      if (!runtime || !session)
        return { requiresConfirmation: false, unresolvedCount: 0 }
      const unresolvedCount = await runtime.cleaner.countUnresolvedOperations(
        session.user.id,
      )
      if (unresolvedCount > 0 && !force)
        return { requiresConfirmation: true, unresolvedCount }
      actionInProgress.current = true
      try {
        await runtime.authClient.signOut()
        const nextGuestOwnerId = runtime.ownerStore.activateGuest()
        commitSession(null)
        setStatus('guest')
        setOwnerId(nextGuestOwnerId)
        pendingGuestDataRef.current = null
        setPendingGuestData(null)
        setMessage(
          'Sesión cerrada. Los datos locales de la cuenta permanecen en este dispositivo.',
        )
        return { requiresConfirmation: false, unresolvedCount }
      } finally {
        actionInProgress.current = false
      }
    },
    [commitSession, runtime, session],
  )

  const deleteLocalData =
    useCallback(async (): Promise<DeleteLocalDataResult> => {
      if (!runtime || !session)
        throw new Error('Debes iniciar sesión para eliminar datos locales.')
      const unresolvedCount = await runtime.cleaner.countUnresolvedOperations(
        session.user.id,
      )
      if (unresolvedCount > 0) return { deleted: false, unresolvedCount }

      actionInProgress.current = true
      setError(null)
      try {
        await runtime.authClient.signOut()
        let cleanupFailure: unknown = null
        let unresolvedAfterSignOut = 0
        try {
          unresolvedAfterSignOut = await runtime.cleaner.deleteOwnerIfResolved(
            session.user.id,
          )
        } catch (reason) {
          cleanupFailure = reason
        }
        const nextGuestOwnerId = runtime.ownerStore.activateGuest()
        commitSession(null)
        setStatus('guest')
        setOwnerId(nextGuestOwnerId)
        pendingGuestDataRef.current = null
        setPendingGuestData(null)
        if (cleanupFailure)
          throw new Error(
            'La sesión se cerró, pero no fue posible eliminar los datos locales.',
            { cause: cleanupFailure },
          )
        if (unresolvedAfterSignOut > 0) {
          setMessage(
            'La sesión se cerró, pero los datos locales se conservaron porque aparecieron cambios sin sincronizar.',
          )
          return {
            deleted: false,
            unresolvedCount: unresolvedAfterSignOut,
          }
        }
        setMessage(
          'Los datos locales de la cuenta fueron eliminados de este dispositivo.',
        )
        return { deleted: true, unresolvedCount: 0 }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'No fue posible eliminar los datos locales.',
        )
        throw reason
      } finally {
        actionInProgress.current = false
      }
    }, [commitSession, runtime, session])

  const requestPasswordReset = useCallback(
    async (input: ForgotPasswordInput) => {
      if (!runtime)
        throw new Error('Configura Supabase para recuperar la contraseña.')
      await runtime.requestPasswordReset.execute(
        input,
        runtime.redirectUrl('/reset-password'),
      )
    },
    [runtime],
  )

  const updatePassword = useCallback(
    async (input: ResetPasswordInput) => {
      if (!runtime)
        throw new Error('Configura Supabase para actualizar la contraseña.')
      await runtime.updatePassword.execute(input)
    },
    [runtime],
  )

  const deleteAccount = useCallback(
    async (confirmation: string) => {
      if (!runtime || !session)
        throw new Error('Debes iniciar sesión para eliminar tu cuenta.')
      actionInProgress.current = true
      setError(null)
      try {
        await runtime.deleteAccount.execute({ confirmation })
        let cleanupFailure: unknown = null
        try {
          await runtime.cleaner.deleteOwner(session.user.id)
        } catch (reason) {
          cleanupFailure = reason
        }
        try {
          await runtime.authClient.clearLocalSession()
        } catch (reason) {
          cleanupFailure ??= reason
        }
        const nextGuestOwnerId = runtime.ownerStore.createEmptyGuest()
        commitSession(null)
        setStatus('guest')
        setOwnerId(nextGuestOwnerId)
        pendingGuestDataRef.current = null
        setPendingGuestData(null)
        setMessage(
          'La cuenta y sus datos fueron eliminados de forma permanente.',
        )
        if (cleanupFailure)
          throw new Error(
            'La cuenta fue eliminada, pero la limpieza local requiere reintento.',
            { cause: cleanupFailure },
          )
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'No fue posible eliminar la cuenta.',
        )
        throw reason
      } finally {
        actionInProgress.current = false
      }
    },
    [commitSession, runtime, session],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      ownerId,
      isConfigured: runtime !== null,
      error,
      message,
      pendingGuestData,
      signUp,
      signIn,
      signOut,
      deleteLocalData,
      deleteAccount,
      requestPasswordReset,
      updatePassword,
      revalidateSession,
      resolveGuestData,
      clearMessage: () => setMessage(null),
    }),
    [
      deleteAccount,
      deleteLocalData,
      error,
      message,
      ownerId,
      pendingGuestData,
      revalidateSession,
      requestPasswordReset,
      resolveGuestData,
      runtime,
      session,
      signIn,
      signOut,
      signUp,
      status,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.')
  return context
}

// Útil para componentes incrustables que también se prueban fuera del shell autenticado.
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext)
}
