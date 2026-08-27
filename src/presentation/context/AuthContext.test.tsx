import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { SignIn } from '@application/use-cases/auth/SignIn'
import { SignUp } from '@application/use-cases/auth/SignUp'
import { RequestPasswordReset } from '@application/use-cases/auth/RequestPasswordReset'
import { UpdatePassword } from '@application/use-cases/auth/UpdatePassword'
import { DeleteAccount } from '@application/use-cases/auth/DeleteAccount'
import {
  DataMigrationService,
  LocalUserDataCleaner,
  type OwnerDataPort,
} from '@application/services/DataMigrationService'
import {
  AuthClientError,
  type AuthClient,
  type AuthSession,
  type AuthStateEvent,
  type AuthStateListener,
} from '@application/services/AuthClient'
import type { SyncOperationStatus } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieOwnerDataManager } from '@infrastructure/local/DexieOwnerDataManager'
import type { AuthRuntime } from '../../app/composition-root'
import { AuthProvider, useAuth } from './AuthContext'

const guestOwnerId = 'guest:10000000-0000-4000-8000-000000000001'
const session: AuthSession = {
  user: {
    id: '20000000-0000-4000-8000-000000000002',
    email: 'persona@example.com',
  },
  expiresAt: 1_800_000_000,
}
const emptySummary = {
  periods: 0,
  incomes: 0,
  expenses: 0,
  categories: 0,
  budgets: 0,
  recurringPayments: 0,
  occurrences: 0,
  balanceAnchors: 0,
  hasData: false,
}

function createRuntime(
  initialSession: AuthSession | null = null,
  ownerDataOverride?: OwnerDataPort,
) {
  const unsubscribe = vi.fn()
  let listener: AuthStateListener | null = null
  const authClient: AuthClient = {
    signUp: vi.fn(async () => ({
      user: session.user,
      session,
      requiresEmailVerification: false,
    })),
    signIn: vi.fn(async () => ({
      user: session.user,
      session,
      requiresEmailVerification: false,
    })),
    signOut: vi.fn(async () => undefined),
    clearLocalSession: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    exchangeCodeForSession: vi.fn(async () => ({
      session,
      kind: 'authentication' as const,
    })),
    getSession: vi.fn(async () => initialSession),
    revalidateSession: vi.fn(async () => session),
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn(),
    onAuthStateChange: vi.fn((nextListener) => {
      listener = nextListener
      return unsubscribe
    }),
  }
  const ownerData: OwnerDataPort = ownerDataOverride ?? {
    summarize: vi.fn(async () => emptySummary),
    migrateOwner: vi.fn(async () => undefined),
    deleteOwner: vi.fn(async () => undefined),
    deleteOwnerIfResolved: vi.fn(async () => 0),
    countUnresolvedOperations: vi.fn(async () => 0),
    hasLocalData: vi.fn(async () => true),
  }
  const deletionClient = { deleteCurrentAccount: vi.fn(async () => undefined) }
  const runtime: AuthRuntime = {
    authClient,
    sessionManager: {
      restore: async (isOnline, hasLocalData) => {
        const current = await authClient.getSession()
        if (!current) return { status: 'guest', session: null }
        if (isOnline) return { status: 'authenticated', session: current }
        await hasLocalData(current.user.id)
        return { status: 'offline-authenticated', session: current }
      },
      subscribe: (nextListener) => authClient.onAuthStateChange(nextListener),
    },
    signUp: new SignUp(authClient),
    signIn: new SignIn(authClient),
    requestPasswordReset: new RequestPasswordReset(authClient),
    updatePassword: new UpdatePassword(authClient),
    deleteAccount: new DeleteAccount(deletionClient),
    migration: new DataMigrationService(ownerData),
    cleaner: new LocalUserDataCleaner(ownerData),
    ownerStore: {
      setActive: vi.fn(),
      activateGuest: vi.fn(() => guestOwnerId),
      createEmptyGuest: vi.fn(
        () => 'guest:30000000-0000-4000-8000-000000000003',
      ),
    },
    authCallbacks: null,
    authSessionLifecycle: null,
    redirectUrl: (path) => `${window.location.origin}${path}`,
  }
  return {
    runtime,
    authClient,
    ownerData,
    deletionClient,
    unsubscribe,
    emit: (value: AuthSession | null, event: AuthStateEvent = 'signed-in') =>
      listener?.({ event, session: value }),
  }
}

async function seedAuthenticatedOwner(
  db: GastoClaroDB,
  status: SyncOperationStatus | null,
) {
  const base = {
    ownerId: session.user.id,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    deletedAt: null,
    syncStatus: 'pending' as const,
  }
  await db.periods.add({
    ...base,
    id: 'period-preserved',
    type: 'monthly',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  })
  await db.categories.add({
    ...base,
    id: 'category-preserved',
    name: 'Sin categoría',
    normalizedName: 'sin categoría',
    color: '#64748B',
    icon: null,
    isSystem: true,
  })
  await db.expenses.bulkAdd(
    [100_000, 12_550].map((amount, index) => ({
      ...base,
      id: `expense-preserved-${index}`,
      periodId: 'period-preserved',
      categoryId: 'category-preserved',
      amount,
      description: `Gasto ${index}`,
      date: '2026-08-09',
      recurringOccurrenceId: null,
    })),
  )
  await db.userSettings.add({
    id: 'settings-preserved',
    ownerId: session.user.id,
    activePeriodId: 'period-preserved',
    currency: 'MXN',
    theme: 'system',
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  })
  if (status)
    await db.syncOperations.add({
      operationId: `operation-${status}`,
      ownerId: session.user.id,
      entityType: 'expense',
      entityId: 'expense-preserved-0',
      operationType: 'create',
      payload: '{}',
      createdAt: base.createdAt,
      status,
      errorMessage: status === 'error' ? 'incidente reproducido' : null,
      retryCount: status === 'error' ? 1 : 0,
    })
}

async function preservedCounts(db: GastoClaroDB) {
  return Promise.all([
    db.periods.where('ownerId').equals(session.user.id).count(),
    db.categories.where('ownerId').equals(session.user.id).count(),
    db.expenses.where('ownerId').equals(session.user.id).count(),
    db.userSettings.where('ownerId').equals(session.user.id).count(),
    db.syncOperations.where('ownerId').equals(session.user.id).count(),
  ])
}

function wrapper(runtime: AuthRuntime | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <AuthProvider runtime={runtime} guestOwnerId={guestOwnerId}>
          {children}
        </AuthProvider>
      </MemoryRouter>
    )
  }
}

describe('AuthContext', () => {
  beforeEach(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    }),
  )

  it('comienza loading mientras restaura una sesión', () => {
    const setup = createRuntime()
    vi.mocked(setup.authClient.getSession).mockImplementation(
      () => new Promise(() => undefined),
    )
    const { result, unmount } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    expect(result.current.status).toBe('loading')
    unmount()
  })

  it('entra como invitado cuando no existe sesión', async () => {
    const setup = createRuntime(null)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    expect(result.current.ownerId).toBe(guestOwnerId)
  })

  it('restaura usuario autenticado', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(result.current.user).toEqual(session.user)
  })

  it('restaura offline solo con sesión y datos locales del mismo owner', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() =>
      expect(result.current.status).toBe('offline-authenticated'),
    )
    expect(setup.ownerData.hasLocalData).toHaveBeenCalledWith(session.user.id)
  })

  it('sign in actualiza estado y owner sin datos guest', async () => {
    const setup = createRuntime(null)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(() =>
      result.current.signIn({
        email: 'PERSONA@example.com',
        password: '12345678',
      }),
    )
    expect(result.current.status).toBe('authenticated')
    expect(result.current.ownerId).toBe(session.user.id)
  })

  it('registro con datos invitados ofrece migración y la ejecuta al confirmar', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      expenses: 1,
      hasData: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    const action = await act(() =>
      result.current.signUp({
        email: 'persona@example.com',
        password: '12345678',
        passwordConfirmation: '12345678',
      }),
    )
    expect(action.requiresGuestDecision).toBe(true)
    expect(result.current.pendingGuestData?.reason).toBe('register')
    await act(() => result.current.resolveGuestData('migrate-local'))
    expect(setup.ownerData.migrateOwner).toHaveBeenCalledWith(
      guestOwnerId,
      session.user.id,
    )
  })

  it('registro sin datos invitados entra a la cuenta sin migración', async () => {
    const setup = createRuntime(null)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    const action = await act(() =>
      result.current.signUp({
        email: 'persona@example.com',
        password: '12345678',
        passwordConfirmation: '12345678',
      }),
    )
    expect(action.requiresGuestDecision).toBe(false)
    expect(result.current.ownerId).toBe(session.user.id)
    expect(setup.authClient.requestPasswordReset).toHaveBeenCalledWith(
      'persona@example.com',
      `${window.location.origin}/reset-password`,
    )
    expect(setup.authClient.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'persona@example.com' }),
      `${window.location.origin}/verify-email`,
    )
    expect(setup.ownerData.migrateOwner).not.toHaveBeenCalled()
  })

  it('registro aceptado sin sesión conserva el owner y los datos invitados', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.authClient.signUp).mockResolvedValue({
      user: session.user,
      session: null,
      requiresEmailVerification: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))

    const action = await act(() =>
      result.current.signUp({
        email: 'persona@example.com',
        password: '12345678',
        passwordConfirmation: '12345678',
      }),
    )

    expect(action.requiresGuestDecision).toBe(false)
    expect(result.current.status).toBe('guest')
    expect(result.current.ownerId).toBe(guestOwnerId)
    expect(result.current.pendingGuestData).toBeNull()
    expect(setup.ownerData.summarize).not.toHaveBeenCalled()
    expect(setup.ownerData.migrateOwner).not.toHaveBeenCalled()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
  })

  it('pide una decisión antes de mezclar datos invitados con la cuenta', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      expenses: 2,
      hasData: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    const action = await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    expect(action.requiresGuestDecision).toBe(true)
    expect(result.current.ownerId).toBe(guestOwnerId)
    expect(result.current.pendingGuestData?.summary.expenses).toBe(2)
    expect(setup.ownerData.migrateOwner).not.toHaveBeenCalled()
  })

  it('migra todos los datos solo después de la decisión explícita', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      periods: 1,
      hasData: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    await act(() => result.current.resolveGuestData('migrate-local'))
    expect(setup.ownerData.migrateOwner).toHaveBeenCalledWith(
      guestOwnerId,
      session.user.id,
    )
    expect(result.current.ownerId).toBe(session.user.id)
    expect(result.current.pendingGuestData).toBeNull()
  })

  it('cancelar conserva los datos invitados y cierra la sesión recién iniciada', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      categories: 1,
      hasData: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    await act(() => result.current.resolveGuestData('cancel'))
    expect(setup.authClient.signOut).toHaveBeenCalledOnce()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(setup.ownerData.migrateOwner).not.toHaveBeenCalled()
    expect(result.current.ownerId).toBe(guestOwnerId)
  })

  it('conservar la cuenta mantiene separado el dataset invitado', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      budgets: 1,
      hasData: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    await act(() => result.current.resolveGuestData('keep-account'))
    expect(setup.ownerData.migrateOwner).not.toHaveBeenCalled()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(result.current.ownerId).toBe(session.user.id)
  })

  it('descartar elimina únicamente el dataset invitado', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      periods: 1,
      hasData: true,
    })
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    await act(() => result.current.resolveGuestData('discard-local'))
    expect(setup.ownerData.deleteOwner).toHaveBeenCalledWith(guestOwnerId)
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalledWith(
      session.user.id,
    )
    expect(result.current.ownerId).toBe(session.user.id)
  })

  it('un fallo de migración conserva owner y decisión para reintentar', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.ownerData.summarize).mockResolvedValue({
      ...emptySummary,
      incomes: 1,
      hasData: true,
    })
    vi.mocked(setup.ownerData.migrateOwner).mockRejectedValue(
      new Error('rollback aplicado'),
    )
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    await expect(
      act(() => result.current.resolveGuestData('migrate-local')),
    ).rejects.toThrow('rollback aplicado')
    expect(result.current.ownerId).toBe(guestOwnerId)
    expect(result.current.pendingGuestData).not.toBeNull()
  })

  it('sign out conserva el owner autenticado y vuelve a invitado', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await act(() => result.current.signOut())
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(setup.runtime.ownerStore.activateGuest).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('guest')
  })

  it('advierte y no cierra sesión mientras existan operaciones no resueltas', async () => {
    const setup = createRuntime(session)
    vi.mocked(setup.ownerData.countUnresolvedOperations).mockResolvedValue(3)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    const response = await act(() => result.current.signOut())
    expect(response).toEqual({
      requiresConfirmation: true,
      unresolvedCount: 3,
    })
    expect(setup.authClient.signOut).not.toHaveBeenCalled()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(result.current.status).toBe('authenticated')
  })

  it('cerrar sesión de todos modos conserva datos y cola no resuelta', async () => {
    const setup = createRuntime(session)
    vi.mocked(setup.ownerData.countUnresolvedOperations).mockResolvedValue(2)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    const response = await act(() => result.current.signOut(true))
    expect(response).toEqual({
      requiresConfirmation: false,
      unresolvedCount: 2,
    })
    expect(setup.authClient.signOut).toHaveBeenCalledOnce()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(result.current.status).toBe('guest')
  })

  it('reactiva los datos del mismo owner al volver a iniciar sesión', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await act(() => result.current.signOut())
    await act(() =>
      result.current.signIn({
        email: 'persona@example.com',
        password: '12345678',
      }),
    )
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(setup.runtime.ownerStore.setActive).toHaveBeenLastCalledWith(
      session.user.id,
    )
    expect(result.current.ownerId).toBe(session.user.id)
  })

  it('bloquea la eliminación local explícita con operaciones no resueltas', async () => {
    const setup = createRuntime(session)
    vi.mocked(setup.ownerData.countUnresolvedOperations).mockResolvedValue(1)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    const response = await act(() => result.current.deleteLocalData())
    expect(response).toEqual({ deleted: false, unresolvedCount: 1 })
    expect(setup.authClient.signOut).not.toHaveBeenCalled()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
  })

  it('solo la acción local explícita puede eliminar el owner sin cambios pendientes', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    const response = await act(() => result.current.deleteLocalData())
    expect(response).toEqual({ deleted: true, unresolvedCount: 0 })
    expect(setup.authClient.signOut).toHaveBeenCalledOnce()
    expect(setup.ownerData.deleteOwnerIfResolved).toHaveBeenCalledWith(
      session.user.id,
    )
    expect(result.current.status).toBe('guest')
  })

  it('conserva los datos si aparece una operación durante la eliminación explícita', async () => {
    const setup = createRuntime(session)
    vi.mocked(setup.ownerData.deleteOwnerIfResolved).mockResolvedValue(1)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    const response = await act(() => result.current.deleteLocalData())
    expect(response).toEqual({ deleted: false, unresolvedCount: 1 })
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(result.current.status).toBe('guest')
  })

  it.each([null, 'pending', 'error', 'processing'] as const)(
    'conserva físicamente datos y cola tras logout con estado %s',
    async (operationStatus) => {
      const db = new GastoClaroDB(`auth-logout-${crypto.randomUUID()}`)
      try {
        await seedAuthenticatedOwner(db, operationStatus)
        const before = await preservedCounts(db)
        const setup = createRuntime(
          session,
          new DexieOwnerDataManager(db, {
            getItem: () => null,
            setItem: vi.fn(),
          }),
        )
        const { result, unmount } = renderHook(() => useAuth(), {
          wrapper: wrapper(setup.runtime),
        })
        await waitFor(() => expect(result.current.status).toBe('authenticated'))
        if (operationStatus) {
          expect(await act(() => result.current.signOut())).toEqual({
            requiresConfirmation: true,
            unresolvedCount: 1,
          })
          expect(result.current.status).toBe('authenticated')
          expect(await preservedCounts(db)).toEqual(before)
        }
        await act(() => result.current.signOut(operationStatus !== null))
        expect(result.current.status).toBe('guest')
        expect(await preservedCounts(db)).toEqual(before)
        expect(before).toEqual([1, 1, 2, 1, operationStatus ? 1 : 0])
        unmount()
      } finally {
        await db.delete()
      }
    },
  )

  it('no limpia datos locales cuando falla la eliminación remota de cuenta', async () => {
    const setup = createRuntime(session)
    setup.deletionClient.deleteCurrentAccount.mockRejectedValue(
      new Error('fallo remoto'),
    )
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await expect(
      act(() => result.current.deleteAccount('ELIMINAR')),
    ).rejects.toThrow('fallo remoto')
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
    expect(setup.authClient.clearLocalSession).not.toHaveBeenCalled()
    expect(result.current.status).toBe('authenticated')
  })

  it('limpia IndexedDB y sesión local únicamente tras eliminar la cuenta remota', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await act(() => result.current.deleteAccount('ELIMINAR'))
    expect(setup.deletionClient.deleteCurrentAccount).toHaveBeenCalledOnce()
    expect(setup.ownerData.deleteOwner).toHaveBeenCalledWith(session.user.id)
    expect(setup.authClient.clearLocalSession).toHaveBeenCalledOnce()
    expect(
      setup.deletionClient.deleteCurrentAccount.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      vi.mocked(setup.ownerData.deleteOwner).mock.invocationCallOrder[0]!,
    )
    expect(result.current.status).toBe('guest')
  })

  it('elimina la única suscripción al desmontar', () => {
    const setup = createRuntime(null)
    const { unmount } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    expect(setup.authClient.onAuthStateChange).toHaveBeenCalledOnce()
    unmount()
    expect(setup.unsubscribe).toHaveBeenCalledOnce()
  })

  it('procesa un cambio de sesión sin registrar listeners adicionales', async () => {
    const setup = createRuntime(null)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('guest'))
    await act(async () => setup.emit(session))
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(setup.authClient.onAuthStateChange).toHaveBeenCalledOnce()
  })

  it('TOKEN_REFRESHED conserva usuario, owner, cola y no dispara migración', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    const refreshed = { ...session, expiresAt: session.expiresAt! + 3600 }
    await act(async () => setup.emit(refreshed, 'token-refreshed'))
    expect(result.current.status).toBe('authenticated')
    expect(result.current.session).toEqual(refreshed)
    expect(result.current.ownerId).toBe(session.user.id)
    expect(setup.ownerData.migrateOwner).not.toHaveBeenCalled()
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
  })

  it('refresh exitoso mantiene el mismo userId y owner', async () => {
    const setup = createRuntime(session)
    const refreshed = { ...session, expiresAt: session.expiresAt! + 3600 }
    vi.mocked(setup.authClient.revalidateSession).mockResolvedValue(refreshed)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await expect(act(() => result.current.revalidateSession())).resolves.toBe(
      'authenticated',
    )
    expect(result.current.user?.id).toBe(session.user.id)
    expect(result.current.ownerId).toBe(session.user.id)
    expect(setup.runtime.ownerStore.activateGuest).not.toHaveBeenCalled()
  })

  it('INITIAL_SESSION null durante revalidación no cambia a guest', async () => {
    const setup = createRuntime(session)
    let resolveRefresh: ((value: AuthSession) => void) | null = null
    vi.mocked(setup.authClient.revalidateSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    let revalidation: Promise<unknown>
    act(() => {
      revalidation = result.current.revalidateSession()
    })
    await waitFor(() => expect(result.current.status).toBe('revalidating'))
    await act(async () => setup.emit(null, 'initial-session'))
    expect(result.current.status).toBe('revalidating')
    expect(result.current.ownerId).toBe(session.user.id)
    expect(setup.runtime.ownerStore.activateGuest).not.toHaveBeenCalled()
    await act(async () => resolveRefresh?.(session))
    await revalidation!
  })

  it('fallo retryable de refresh preserva sesión y nunca ejecuta signOut local', async () => {
    const setup = createRuntime(session)
    vi.mocked(setup.authClient.revalidateSession).mockRejectedValue(
      new AuthClientError('network', 'temporal', 'request_timeout', 504),
    )
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await expect(act(() => result.current.revalidateSession())).resolves.toBe(
      'retryable-failure',
    )
    expect(result.current.status).toBe('offline-authenticated')
    expect(result.current.ownerId).toBe(session.user.id)
    expect(result.current.session).toEqual(session)
    expect(setup.authClient.clearLocalSession).not.toHaveBeenCalled()
    expect(setup.authClient.signOut).not.toHaveBeenCalled()
  })

  it('refresh token definitivamente inválido permite limpiar y pasar a guest', async () => {
    const setup = createRuntime(session)
    vi.mocked(setup.authClient.revalidateSession).mockRejectedValue(
      new AuthClientError(
        'session-invalid',
        'invalidada',
        'refresh_token_not_found',
        400,
      ),
    )
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await expect(act(() => result.current.revalidateSession())).resolves.toBe(
      'signed-out',
    )
    expect(setup.authClient.clearLocalSession).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('guest')
    expect(result.current.session).toBeNull()
  })

  it('SIGNED_OUT confirmado pasa a guest sin borrar datos locales', async () => {
    const setup = createRuntime(session)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    await act(async () => setup.emit(null, 'signed-out'))
    expect(result.current.status).toBe('guest')
    expect(setup.ownerData.deleteOwner).not.toHaveBeenCalled()
  })

  it('controla una sola instancia del lifecycle nativo y ejecuta cleanup', () => {
    const setup = createRuntime(null)
    const cleanup = vi.fn()
    const start = vi.fn(() => cleanup)
    setup.runtime.authSessionLifecycle = { start } as never
    const { rerender, unmount } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    rerender()
    expect(start).toHaveBeenCalledOnce()
    unmount()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('Android no restaura ni habilita sync antes del gate de foreground', async () => {
    const setup = createRuntime(session)
    let foreground: (() => Promise<void>) | null = null
    setup.runtime.authSessionLifecycle = {
      start: vi.fn((handlers) => {
        foreground = handlers.onForeground
        return vi.fn()
      }),
    } as never
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() =>
      expect(setup.runtime.authSessionLifecycle?.start).toHaveBeenCalledOnce(),
    )
    expect(setup.authClient.getSession).not.toHaveBeenCalled()
    expect(result.current.status).toBe('loading')
    await act(async () => foreground?.())
    expect(setup.authClient.getSession).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('authenticated')
    expect(result.current.ownerId).toBe(session.user.id)
  })

  it('mantiene restauración bloqueada ante un fallo temporal sin activar guest', async () => {
    const setup = createRuntime(null)
    vi.mocked(setup.authClient.getSession).mockRejectedValue(new Error('fallo'))
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(setup.runtime),
    })
    await waitFor(() =>
      expect(result.current.error).toBe('No fue posible restaurar la sesión.'),
    )
    expect(result.current.session).toBeNull()
    expect(result.current.status).toBe('revalidating')
  })
})
