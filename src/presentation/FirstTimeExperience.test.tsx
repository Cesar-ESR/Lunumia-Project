import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthSession } from '@application/services/AuthClient'
import type {
  SyncOrchestrator,
  SyncState,
} from '@application/services/SyncOrchestrator'
import type { AuthRuntime } from '../app/composition-root'
import { PeriodOverlapError } from '@domain/errors'
import { App } from './App'
import {
  createApplicationServicesMock,
  createFinancialSnapshotMock,
  createPeriodMock,
} from './test/test-factories'
import {
  createMonthlyPeriodProposal,
  readInternalDestination,
  resolvePeriodProposal,
} from './utils/first-time'
import { requestDirtyNavigation } from './utils/dirty-navigation'

function renderFirstTime(path = '/inicio') {
  window.history.replaceState({}, '', path)
  const result = createApplicationServicesMock({
    activePeriod: null,
    financialSnapshot: createFinancialSnapshotMock({
      currentBalanceCents: null,
      projectedAvailableCents: null,
      projectedClosingBalanceCents: null,
    }),
  })
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, ...view }
}

function createAuthenticatedRuntime(): AuthRuntime {
  const session: AuthSession = {
    user: { id: 'account-owner', email: 'persona@example.com' },
    expiresAt: 1_900_000_000,
  }
  return {
    sessionManager: {
      restore: vi.fn(async () => ({
        status: 'authenticated' as const,
        session,
      })),
      subscribe: vi.fn(() => () => undefined),
    },
    ownerStore: { setActive: vi.fn() },
    cleaner: { hasLocalData: vi.fn(async () => true) },
    authSessionLifecycle: null,
    authCallbacks: null,
  } as unknown as AuthRuntime
}

function createLoginRuntime(onAuthenticated: () => void) {
  const session: AuthSession = {
    user: { id: 'account-owner', email: 'persona@example.com' },
    expiresAt: 1_900_000_000,
  }
  const signIn = vi.fn(async () => {
    onAuthenticated()
    return {
      user: session.user,
      session,
      requiresEmailVerification: false,
    }
  })
  const runtime = {
    sessionManager: {
      restore: vi.fn(async () => ({ status: 'guest' as const, session: null })),
      subscribe: vi.fn(() => () => undefined),
    },
    signIn: { execute: signIn },
    migration: {
      summarize: vi.fn(async () => ({
        periods: 0,
        incomes: 0,
        expenses: 0,
        categories: 0,
        budgets: 0,
        recurringPayments: 0,
        occurrences: 0,
        balanceAnchors: 0,
        hasData: false,
      })),
    },
    ownerStore: { setActive: vi.fn() },
    cleaner: { hasLocalData: vi.fn(async () => false) },
    authSessionLifecycle: null,
    authCallbacks: null,
    redirectUrl: (path: string) => `${window.location.origin}${path}`,
  } as unknown as AuthRuntime
  return { runtime, signIn }
}

class TestSyncOrchestrator {
  constructor(public state: SyncState) {}
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

const authenticatedSyncState = (
  overrides: Partial<SyncState> = {},
): SyncState => ({
  status: 'syncing',
  ownerId: 'account-owner',
  pendingCount: 0,
  isOnline: true,
  isSyncing: true,
  lastAttemptAt: '2026-08-27T12:00:00.000Z',
  lastSuccessfulSyncAt: null,
  nextRetryAt: null,
  retryCount: 0,
  error: null,
  lastResult: null,
  canRetryManually: false,
  ...overrides,
})

describe('primera experiencia derivada del estado real', () => {
  it('presenta Lunumia antes de pedir configuración y sin persistir', async () => {
    const { services } = renderFirstTime()
    expect(
      await screen.findByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Registra lo que entra y sale')).toBeInTheDocument()
    expect(screen.getByText('Entiende cómo estás hoy')).toBeInTheDocument()
    expect(screen.getByText('Mira lo que viene')).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /cuenta|sesión/i })).toBeNull()
    expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()
    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
  })

  it('entra al periodo con Comenzar sin escribir y conserva la divulgación progresiva', async () => {
    const user = userEvent.setup()
    const { services } = renderFirstTime()
    await screen.findByRole('heading', {
      name: 'Entiende tu dinero con más claridad',
    })

    await user.click(screen.getByRole('button', { name: 'Comenzar' }))

    expect(window.location.pathname).toBe('/configuracion-inicial/periodo')
    expect(
      await screen.findByRole('heading', {
        name: 'Organicemos tus movimientos',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Periodo sugerido')).toBeInTheDocument()
    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cambiar periodo' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Tipo')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: 'Cambiar fechas o usar quincena',
      }),
    ).toBeNull()
    expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cambiar periodo' }))
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha inicial')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha final')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ocultar opciones' }),
    ).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Ocultar opciones' }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it('protege cambios significativos del periodo con el guard existente', async () => {
    const user = userEvent.setup()
    renderFirstTime('/configuracion-inicial/periodo')
    await screen.findByRole('heading', { name: 'Organicemos tus movimientos' })
    await user.click(screen.getByRole('button', { name: 'Cambiar periodo' }))
    await user.selectOptions(screen.getByLabelText('Tipo'), 'biweekly')
    const leave = vi.fn()

    act(() => expect(requestDirtyNavigation(leave)).toBe(true))

    expect(
      screen.getByRole('dialog', { name: '¿Salir sin guardar?' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(leave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Tipo')).toHaveValue('biweekly')

    act(() => expect(requestDirtyNavigation(leave)).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Salir' }))
    expect(leave).toHaveBeenCalledOnce()
  })

  it('completa Welcome, periodo, categorías, saldo omitido e Inicio sin crear un bucle', async () => {
    const user = userEvent.setup()
    const { services } = renderFirstTime()
    await screen.findByRole('heading', {
      name: 'Entiende tu dinero con más claridad',
    })
    await user.click(screen.getByRole('button', { name: 'Comenzar' }))
    await screen.findByRole('heading', { name: 'Organicemos tus movimientos' })

    const created = createPeriodMock(createMonthlyPeriodProposal())
    vi.mocked(services.periods.createPeriod.execute).mockResolvedValue(created)
    vi.mocked(services.periods.listPeriods.execute).mockResolvedValue([created])
    await user.click(screen.getByRole('button', { name: 'Usar este periodo' }))
    expect(
      await screen.findByRole('heading', { name: 'Organiza tus gastos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    await screen.findByRole('heading', {
      name: '¿Quieres indicar tu saldo actual?',
    })
    expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument()
    await user.click(
      await screen.findByRole('button', { name: 'Hacerlo después' }),
    )

    expect(window.location.pathname).toBe('/inicio')
    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(services.periods.createPeriod.execute).toHaveBeenCalledTimes(1)
    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeNull()
  })

  it('vuelve a mostrar Welcome al recargar antes de crear un periodo', async () => {
    const first = renderFirstTime('/configuracion-inicial')
    await screen.findByRole('heading', {
      name: 'Entiende tu dinero con más claridad',
    })
    first.unmount()

    const second = renderFirstTime('/configuracion-inicial')

    expect(
      await screen.findByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeInTheDocument()
    expect(second.services.periods.createPeriod.execute).not.toHaveBeenCalled()
    expect(
      second.services.balance.setCurrentBalance.execute,
    ).not.toHaveBeenCalled()
  })

  it('confirma mediante el writer oficial y después ofrece saldo', async () => {
    const user = userEvent.setup()
    const { services } = renderFirstTime('/configuracion-inicial/periodo')
    await screen.findByRole('heading', {
      name: 'Organicemos tus movimientos',
    })
    const proposal = createMonthlyPeriodProposal()
    const created = createPeriodMock(proposal)
    vi.mocked(services.periods.createPeriod.execute).mockResolvedValue(created)
    vi.mocked(services.periods.listPeriods.execute).mockResolvedValue([created])

    await user.click(screen.getByRole('button', { name: 'Usar este periodo' }))

    expect(services.periods.createPeriod.execute).toHaveBeenCalledWith({
      ...proposal,
      ownerId: services.ownerId,
    })
    expect(services.periods.setActivePeriod.execute).toHaveBeenCalledWith(
      created.id,
    )
    expect(
      await screen.findByRole('heading', { name: 'Organiza tus gastos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(
      await screen.findByRole('heading', {
        name: '¿Quieres indicar tu saldo actual?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument()
    expect(
      screen.getByText(/Puedes hacerlo ahora o más adelante/),
    ).toBeInTheDocument()
    expect(screen.queryByText('(Obligatorio)')).toBeNull()
    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
  })

  it('omite la propuesta para un usuario con periodo utilizable', async () => {
    window.history.replaceState({}, '', '/inicio')
    const { services } = createApplicationServicesMock()
    render(<App services={services} authServices={null} />)
    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeNull()
    expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it('redirige a Inicio si un usuario recurrente abre Welcome directamente', async () => {
    window.history.replaceState({}, '', '/configuracion-inicial')
    const { services } = createApplicationServicesMock()
    render(<App services={services} authServices={null} />)

    await waitFor(() => expect(window.location.pathname).toBe('/inicio'))
    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeNull()
  })

  it('muestra Welcome a una persona autenticada con estado vacío autoritativo', async () => {
    window.history.replaceState({}, '', '/inicio')
    const result = createApplicationServicesMock({ activePeriod: null })
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeInTheDocument()
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it('no muestra Welcome si existen periodos históricos aunque activePeriod sea null', async () => {
    window.history.replaceState({}, '', '/inicio')
    const historical = createPeriodMock({
      ownerId: 'account-owner',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    })
    const result = createApplicationServicesMock({
      activePeriod: null,
      periods: [historical],
    })
    result.services.ownerId = 'account-owner'
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).not.toHaveBeenCalled()
  })

  it('preserva una selección explícita de periodo histórico', async () => {
    window.history.replaceState({}, '', '/inicio')
    const historical = createPeriodMock({
      ownerId: 'account-owner',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    })
    const result = createApplicationServicesMock({
      activePeriod: null,
      periods: [historical],
    })
    result.services.ownerId = 'account-owner'
    vi.mocked(
      result.services.settings.getUserSettings.execute,
    ).mockResolvedValue({
      id: 'settings',
      ownerId: 'account-owner',
      activePeriodId: historical.id,
      currency: 'MXN',
      theme: 'system',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).not.toHaveBeenCalled()
  })

  it('espera la hidratación autenticada antes de decidir Welcome', async () => {
    window.history.replaceState({}, '', '/inicio')
    const result = createApplicationServicesMock({ activePeriod: null })
    result.services.ownerId = 'account-owner'
    const orchestrator = new TestSyncOrchestrator(authenticatedSyncState())
    result.services.syncOrchestrator =
      orchestrator as unknown as SyncOrchestrator
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )

    expect(
      await screen.findByText('Sincronizando tu cuenta…'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it('muestra Welcome solo después de confirmar una cuenta autenticada vacía', async () => {
    window.history.replaceState({}, '', '/inicio')
    const result = createApplicationServicesMock({ activePeriod: null })
    result.services.ownerId = 'account-owner'
    const orchestrator = new TestSyncOrchestrator(
      authenticatedSyncState({
        status: 'up_to_date',
        isSyncing: false,
        lastSuccessfulSyncAt: '2026-08-27T12:01:00.000Z',
      }),
    )
    result.services.syncOrchestrator =
      orchestrator as unknown as SyncOrchestrator
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeInTheDocument()
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it('refresca tras hidratación y entra a Inicio sin recrear el periodo remoto', async () => {
    window.history.replaceState({}, '', '/inicio')
    const hydrated = createPeriodMock({
      ownerId: 'account-owner',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    let periods = [] as ReturnType<typeof createPeriodMock>[]
    let activePeriodId: string | null = null
    const result = createApplicationServicesMock({ activePeriod: null })
    result.services.ownerId = 'account-owner'
    vi.mocked(result.services.periods.listPeriods.execute).mockImplementation(
      async () => periods,
    )
    vi.mocked(
      result.services.settings.getUserSettings.execute,
    ).mockImplementation(async () => ({
      id: 'settings',
      ownerId: 'account-owner',
      activePeriodId,
      currency: 'MXN',
      theme: 'system',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }))
    const orchestrator = new TestSyncOrchestrator(authenticatedSyncState())
    result.services.syncOrchestrator =
      orchestrator as unknown as SyncOrchestrator
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )
    await screen.findByText('Sincronizando tu cuenta…')

    periods = [hydrated]
    activePeriodId = hydrated.id
    act(() =>
      orchestrator.emit(
        authenticatedSyncState({
          status: 'up_to_date',
          isSyncing: false,
          lastSuccessfulSyncAt: '2026-08-27T12:01:00.000Z',
        }),
      ),
    )

    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).not.toHaveBeenCalled()
  })

  it('muestra error recuperable si la historia remota sigue desconocida', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/inicio')
    const result = createApplicationServicesMock({ activePeriod: null })
    result.services.ownerId = 'account-owner'
    const orchestrator = new TestSyncOrchestrator(
      authenticatedSyncState({
        status: 'error',
        isSyncing: false,
        error: {
          kind: 'network',
          code: 'network_error',
          retryable: true,
          message: 'No se pudo conectar.',
        },
        canRetryManually: true,
      }),
    )
    result.services.syncOrchestrator =
      orchestrator as unknown as SyncOrchestrator
    render(
      <App
        services={result.services}
        authServices={createAuthenticatedRuntime()}
      />,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos comprobar tu configuración',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(orchestrator.syncNow).toHaveBeenCalledTimes(1)
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'un error de sincronización',
      state: authenticatedSyncState({
        status: 'error',
        isSyncing: false,
        error: {
          kind: 'network',
          code: 'network_error',
          retryable: true,
          message: 'No se pudo conectar.',
        },
      }),
    },
    {
      label: 'una sesión offline',
      state: authenticatedSyncState({
        status: 'offline',
        isOnline: false,
        isSyncing: false,
      }),
    },
  ])(
    'mantiene disponible la historia local durante $label',
    async ({ state }) => {
      window.history.replaceState({}, '', '/inicio')
      const historical = createPeriodMock({
        ownerId: 'account-owner',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      })
      const result = createApplicationServicesMock({
        activePeriod: null,
        periods: [historical],
      })
      result.services.ownerId = 'account-owner'
      result.services.syncOrchestrator = new TestSyncOrchestrator(
        state,
      ) as unknown as SyncOrchestrator
      render(
        <App
          services={result.services}
          authServices={createAuthenticatedRuntime()}
        />,
      )

      expect(
        await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
      expect(
        result.services.periods.createPeriod.execute,
      ).not.toHaveBeenCalled()
    },
  )

  it('inicia sesión, hidrata la cuenta existente y entra a Inicio sin setup', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/login')
    const hydrated = createPeriodMock({
      ownerId: 'account-owner',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    let periods = [] as ReturnType<typeof createPeriodMock>[]
    let activePeriodId: string | null = null
    const result = createApplicationServicesMock({ activePeriod: null })
    vi.mocked(result.services.periods.listPeriods.execute).mockImplementation(
      async () => periods,
    )
    vi.mocked(
      result.services.settings.getUserSettings.execute,
    ).mockImplementation(async () => ({
      id: 'settings',
      ownerId: 'account-owner',
      activePeriodId,
      currency: 'MXN',
      theme: 'system',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }))
    const orchestrator = new TestSyncOrchestrator(authenticatedSyncState())
    result.services.syncOrchestrator =
      orchestrator as unknown as SyncOrchestrator
    const login = createLoginRuntime(() => {
      result.services.ownerId = 'account-owner'
    })
    render(<App services={result.services} authServices={login.runtime} />)

    await screen.findByRole('heading', { name: 'Inicia sesión' })
    await user.type(
      screen.getByRole('textbox', { name: 'Correo' }),
      'persona@example.com',
    )
    await user.type(screen.getByLabelText('Contraseña'), 'correcta-123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(
      await screen.findByText('Sincronizando tu cuenta…'),
    ).toBeInTheDocument()

    periods = [hydrated]
    activePeriodId = hydrated.id
    act(() =>
      orchestrator.emit(
        authenticatedSyncState({
          status: 'up_to_date',
          isSyncing: false,
          lastSuccessfulSyncAt: '2026-08-27T12:02:00.000Z',
        }),
      ),
    )

    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/inicio')
    expect(screen.queryByText('Bienvenido a Lunumia')).toBeNull()
    expect(login.signIn).toHaveBeenCalledTimes(1)
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).not.toHaveBeenCalled()
  })

  it('redirige fuera del setup de periodo si la cuenta ya tiene historia', async () => {
    window.history.replaceState({}, '', '/configuracion-inicial/periodo')
    const historical = createPeriodMock({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    })
    const result = createApplicationServicesMock({
      activePeriod: null,
      periods: [historical],
    })
    render(<App services={result.services} authServices={null} />)

    await waitFor(() => expect(window.location.pathname).toBe('/inicio'))
    expect(screen.queryByText('Organicemos tus movimientos')).toBeNull()
    expect(result.services.periods.createPeriod.execute).not.toHaveBeenCalled()
  })

  it('recupera un solapamiento con una decisión humana y sin duplicar', async () => {
    const user = userEvent.setup()
    const { services } = renderFirstTime('/configuracion-inicial/periodo')
    await screen.findByRole('heading', {
      name: 'Organicemos tus movimientos',
    })
    const existing = createPeriodMock(createMonthlyPeriodProposal())
    vi.mocked(services.periods.createPeriod.execute).mockRejectedValueOnce(
      new PeriodOverlapError(),
    )
    vi.mocked(services.periods.listPeriods.execute).mockResolvedValue([
      existing,
    ])

    await user.click(screen.getByRole('button', { name: 'Usar este periodo' }))

    expect(
      await screen.findByText('Ya tienes un periodo para estas fechas.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Usar periodo existente' }),
    ).toBeInTheDocument()
    expect(services.periods.createPeriod.execute).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole('button', { name: 'Usar periodo existente' }),
    )
    expect(services.periods.setActivePeriod.execute).toHaveBeenCalledWith(
      existing.id,
    )
    expect(
      await screen.findByRole('heading', { name: 'Organiza tus gastos' }),
    ).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(
      await screen.findByRole('heading', {
        name: '¿Quieres indicar tu saldo actual?',
      }),
    ).toBeInTheDocument()
  })

  it('calcula límites mensuales usando la fecha local, incluso en año bisiesto', () => {
    expect(createMonthlyPeriodProposal(new Date(2024, 1, 29, 23, 30))).toEqual({
      type: 'monthly',
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    })
    expect(createMonthlyPeriodProposal(new Date(2026, 11, 31, 23, 59))).toEqual(
      {
        type: 'monthly',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      },
    )
  })

  it.each([
    ['2026-08-01', '2026-08-01', '2026-08-15'],
    ['2026-08-10', '2026-08-01', '2026-08-15'],
    ['2026-08-15', '2026-08-01', '2026-08-15'],
    ['2026-08-16', '2026-08-16', '2026-08-31'],
    ['2026-08-23', '2026-08-16', '2026-08-31'],
    ['2026-08-31', '2026-08-16', '2026-08-31'],
    ['2026-02-20', '2026-02-16', '2026-02-28'],
    ['2028-02-20', '2028-02-16', '2028-02-29'],
  ])(
    'propone la quincena local correcta para %s',
    (today, startDate, endDate) => {
      const [year, month, day] = today.split('-').map(Number)
      expect(
        resolvePeriodProposal(
          'biweekly',
          new Date(year!, month! - 1, day!, 12),
        ),
      ).toEqual({ type: 'biweekly', startDate, endDate })
    },
  )

  it('sincroniza tipo, fechas y resumen al cambiar entre mensual y quincenal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 23, 12))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    try {
      const { services } = renderFirstTime('/configuracion-inicial/periodo')
      await screen.findByRole('heading', {
        name: 'Organicemos tus movimientos',
      })
      expect(screen.getByText('1–31 agosto de 2026')).toBeInTheDocument()
      await user.click(
        screen.getByRole('button', {
          name: 'Cambiar periodo',
        }),
      )

      const type = screen.getByLabelText('Tipo')
      const start = screen.getByLabelText('Fecha inicial')
      const end = screen.getByLabelText('Fecha final')
      await user.selectOptions(type, 'biweekly')

      expect(start).toHaveValue('2026-08-16')
      expect(end).toHaveValue('2026-08-31')
      expect(screen.getByText('16–31 agosto de 2026')).toBeInTheDocument()
      expect(screen.queryByText('1–31 agosto de 2026')).toBeNull()
      expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()

      await user.selectOptions(type, 'monthly')
      expect(start).toHaveValue('2026-08-01')
      expect(end).toHaveValue('2026-08-31')
      expect(screen.getByText('1–31 agosto de 2026')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('no reemplaza fechas manuales en un rerender y confirma exactamente los valores visibles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 23, 12))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    try {
      const { services } = renderFirstTime('/configuracion-inicial/periodo')
      await screen.findByRole('heading', {
        name: 'Organicemos tus movimientos',
      })
      await user.click(
        screen.getByRole('button', {
          name: 'Cambiar periodo',
        }),
      )
      await user.selectOptions(screen.getByLabelText('Tipo'), 'biweekly')
      const start = screen.getByLabelText('Fecha inicial')
      const end = screen.getByLabelText('Fecha final')
      await user.clear(start)
      await user.type(start, '2026-08-17')
      await user.clear(end)
      await user.type(end, '2026-08-30')

      expect(screen.getByText('17–30 agosto de 2026')).toBeInTheDocument()
      expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()
      const created = createPeriodMock({
        type: 'biweekly',
        startDate: '2026-08-17',
        endDate: '2026-08-30',
      })
      vi.mocked(services.periods.createPeriod.execute).mockResolvedValue(
        created,
      )
      vi.mocked(services.periods.listPeriods.execute).mockResolvedValue([
        created,
      ])

      await user.click(
        screen.getByRole('button', { name: 'Usar este periodo' }),
      )

      expect(services.periods.createPeriod.execute).toHaveBeenCalledWith({
        ownerId: services.ownerId,
        type: 'biweekly',
        startDate: '2026-08-17',
        endDate: '2026-08-30',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('permite omitir saldo sin crear un ancla cero y conserva el deep link', async () => {
    const user = userEvent.setup()
    const { services } = renderFirstTime('/expenses')
    await screen.findByRole('heading', {
      name: 'Entiende tu dinero con más claridad',
    })
    await user.click(screen.getByRole('button', { name: 'Comenzar' }))
    await screen.findByRole('heading', { name: 'Organicemos tus movimientos' })
    const created = createPeriodMock(createMonthlyPeriodProposal())
    vi.mocked(services.periods.createPeriod.execute).mockResolvedValue(created)
    vi.mocked(services.periods.listPeriods.execute).mockResolvedValue([created])
    await user.click(screen.getByRole('button', { name: 'Usar este periodo' }))
    expect(
      await screen.findByRole('heading', { name: 'Organiza tus gastos' }),
    ).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    await screen.findByRole('heading', {
      name: '¿Quieres indicar tu saldo actual?',
    })
    await user.click(
      await screen.findByRole('button', { name: 'Hacerlo después' }),
    )

    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { name: 'Gastos' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/expenses')
  })

  it.each([
    ['1234.56', 123456],
    ['-250.75', -25075],
  ])(
    'guarda el saldo %s como centavos firmados mediante SetCurrentBalance',
    async (value, cents) => {
      const user = userEvent.setup()
      window.history.replaceState({ from: '/inicio' }, '', '/saldo/inicial')
      const { services } = createApplicationServicesMock({
        financialSnapshot: createFinancialSnapshotMock({
          currentBalanceCents: null,
          projectedAvailableCents: null,
          projectedClosingBalanceCents: null,
        }),
      })
      render(<App services={services} authServices={null} />)
      const input = await screen.findByRole('textbox', { name: /Saldo actual/ })
      await user.type(input, value)
      await user.click(
        screen.getByRole('button', { name: 'Indicar saldo actual' }),
      )
      expect(services.balance.setCurrentBalance.execute).toHaveBeenCalledWith({
        ownerId: services.ownerId,
        amount: cents,
      })
    },
  )

  it('conserva dinero inválido para corregirlo y no invoca el writer', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/saldo/inicial')
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
      }),
    })
    render(<App services={services} authServices={null} />)
    const input = await screen.findByRole('textbox', { name: /Saldo actual/ })
    await user.type(input, '12.345')
    await user.click(
      screen.getByRole('button', { name: 'Indicar saldo actual' }),
    )
    expect(input).toHaveValue('12.345')
    expect(
      screen.getAllByText(/Escribe un saldo válido/).length,
    ).toBeGreaterThan(0)
    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
  })

  it('no muestra setup de saldo a un usuario que ya tiene ancla, incluso si es cero', async () => {
    window.history.replaceState({}, '', '/saldo/inicial')
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: 0,
      }),
    })
    render(<App services={services} authServices={null} />)
    await waitFor(() => expect(window.location.pathname).toBe('/inicio'))
    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: '¿Quieres indicar tu saldo actual?',
      }),
    ).toBeNull()
  })

  it('exige una elección explícita cuando ya existen movimientos efectivos', async () => {
    window.history.replaceState({}, '', '/saldo/inicial')
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
      }),
    })
    vi.mocked(services.balance.getSetupContext.execute).mockResolvedValue({
      hasEffectiveBalanceMovements: true,
    })
    render(<App services={services} authServices={null} />)

    expect(
      await screen.findByRole('heading', {
        name: '¿Qué saldo quieres indicar?',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Saldo inicial/ }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('radio', { name: /Saldo actual/ }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Elige una referencia' }),
    ).toBeDisabled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('guarda saldo inicial con el writer de apertura y conserva el destino', async () => {
    const user = userEvent.setup()
    window.history.replaceState(
      { usr: { from: '/expenses' }, key: 'balance-opening', idx: 0 },
      '',
      '/saldo/inicial',
    )
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
      }),
    })
    vi.mocked(services.balance.getSetupContext.execute).mockResolvedValue({
      hasEffectiveBalanceMovements: true,
    })
    render(<App services={services} authServices={null} />)

    await user.click(
      await screen.findByRole('radio', { name: /Saldo inicial/ }),
    )
    expect(
      screen.getByText(/aplicará los ingresos y gastos efectivos/),
    ).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: /Saldo inicial/ }),
      '100',
    )
    await user.click(
      screen.getByRole('button', { name: 'Guardar saldo inicial' }),
    )

    expect(services.balance.setOpeningBalance.execute).toHaveBeenCalledWith({
      ownerId: services.ownerId,
      amount: 10_000,
    })
    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
    await waitFor(() => expect(window.location.pathname).toBe('/expenses'))
  })

  it('guarda saldo actual sin reaplicar movimientos anteriores', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/saldo/inicial')
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
      }),
    })
    vi.mocked(services.balance.getSetupContext.execute).mockResolvedValue({
      hasEffectiveBalanceMovements: true,
    })
    render(<App services={services} authServices={null} />)

    await user.click(await screen.findByRole('radio', { name: /Saldo actual/ }))
    expect(screen.getByText(/no se volverán a sumar/)).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: /Saldo actual/ }),
      '100',
    )
    await user.click(
      screen.getByRole('button', { name: 'Indicar saldo actual' }),
    )

    expect(services.balance.setCurrentBalance.execute).toHaveBeenCalledWith({
      ownerId: services.ownerId,
      amount: 10_000,
    })
    expect(services.balance.setOpeningBalance.execute).not.toHaveBeenCalled()
  })

  it('muestra error recuperable si falla el contexto de saldo', async () => {
    window.history.replaceState({}, '', '/saldo/inicial')
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
      }),
    })
    vi.mocked(services.balance.getSetupContext.execute).mockRejectedValue(
      new Error('No se pudo leer el historial.'),
    )
    render(<App services={services} authServices={null} />)
    expect(
      await screen.findByText('No se pudo leer el historial.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /reintentar/i }),
    ).toBeInTheDocument()
  })

  it('un usuario autenticado con datos existentes entra directo sin recrear setup', async () => {
    window.history.replaceState({}, '', '/inicio')
    const { services } = createApplicationServicesMock()
    render(
      <App services={services} authServices={createAuthenticatedRuntime()} />,
    )
    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(services.periods.createPeriod.execute).not.toHaveBeenCalled()
    expect(services.balance.setCurrentBalance.execute).not.toHaveBeenCalled()
  })

  it('preserva un deep link después de restaurar una sesión autenticada', async () => {
    window.history.replaceState(
      { usr: { from: '/expenses' }, key: 'u4-deep-link', idx: 0 },
      '',
      '/login',
    )
    const { services } = createApplicationServicesMock()
    render(
      <App services={services} authServices={createAuthenticatedRuntime()} />,
    )
    expect(
      await screen.findByRole('heading', { name: 'Gastos' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/expenses')
  })

  it('muestra un estado resolutivo sin convertir saldo desconocido en cero', async () => {
    window.history.replaceState({}, '', '/inicio')
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
        projectedAvailableCents: null,
        projectedClosingBalanceCents: null,
      }),
    })
    render(<App services={services} authServices={null} />)
    expect(
      await screen.findByRole('heading', {
        name: 'Aún no conocemos tu saldo actual',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Indicar mi saldo actual' }),
    ).toHaveAttribute('href', '/saldo/inicial')
    expect(screen.queryByText('$0.00')).toBeNull()
  })

  it('rechaza destinos externos en el retorno de setup', () => {
    expect(readInternalDestination({ from: '//example.com' })).toBe('/inicio')
    expect(readInternalDestination({ from: '/expenses?draft=1' })).toBe(
      '/expenses?draft=1',
    )
    expect(
      readInternalDestination({ from: '/configuracion-inicial/categorias' }),
    ).toBe('/inicio')
  })
})
