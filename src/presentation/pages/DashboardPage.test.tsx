import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { getLocalDateOnly } from '@shared/utils/date'
import {
  PERIOD_ID,
  createApplicationServicesMock,
  createCategoryBudgetSummaryMock,
  createDashboardBudgetSummaryMock,
  createExpenseMock,
  createFinancialSnapshotMock,
  createIncomeMock,
  createOccurrenceMock,
  createPeriodMock,
  createRecurringPaymentMock,
} from '../test/test-factories'

const TODAY = getLocalDateOnly()

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10)
}

function currentPeriod() {
  return createPeriodMock({ startDate: TODAY, endDate: addDays(TODAY, 30) })
}

function renderDashboard(
  result = createApplicationServicesMock({ activePeriod: currentPeriod() }),
  path = '/inicio',
) {
  window.history.replaceState({}, '', path)
  return {
    ...result,
    view: render(<App services={result.services} authServices={null} />),
  }
}

function quietSecondaryData(
  result: ReturnType<typeof createApplicationServicesMock>,
) {
  vi.mocked(
    result.services.incomes.listIncomesByPeriod.execute,
  ).mockResolvedValue([])
  vi.mocked(
    result.services.expenses.listExpensesByPeriod.execute,
  ).mockResolvedValue([])
  vi.mocked(
    result.services.recurringPayments.getOverview.execute,
  ).mockResolvedValue({ payments: [], occurrences: [] })
}

describe('DashboardPage U8 Home', () => {
  it('integra el uso del presupuesto seleccionado antes de los destinos del plan', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 500_000,
        spentCents: 320_000,
        budgetRemaining: 180_000,
        configuredBudgetCount: 2,
      }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    const plan = (
      await screen.findByRole('heading', {
        name: 'Resumen del plan',
      })
    ).closest('section')!
    const usage = await within(plan).findByRole('heading', {
      name: 'Uso del presupuesto',
      level: 4,
    })
    const destinations = within(plan).getByRole('navigation', {
      name: 'Destinos del plan',
    })

    expect(usage.compareDocumentPosition(destinations)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(within(plan).getByText('64% utilizado')).toBeInTheDocument()
    expect(
      within(plan).getByRole('progressbar', { name: 'Uso del presupuesto' }),
    ).toHaveAttribute('aria-valuenow', '64')
    expect(result.mocks.getBudgetSummary).toHaveBeenCalledWith(
      expect.objectContaining({ id: PERIOD_ID }),
      TODAY,
    )
    expect(
      within(plan).queryByRole('heading', { name: 'Uso de tus recursos' }),
    ).toBeNull()
  })

  it('usa recursos desde el saldo cuando no existe presupuesto configurado', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 0,
        spentCents: 0,
        budgetRemaining: 0,
        configuredBudgetCount: 0,
      }),
      financialSnapshot: createFinancialSnapshotMock({
        resourceUsage: {
          referenceAt: '2026-08-01T12:00:00.000Z',
          resourceBaseCents: 400_000,
          spentCents: 120_000,
          currentAvailableCents: 280_000,
          canCalculatePercentage: true,
          status: 'available',
        },
      }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    const usage = await screen.findByRole('heading', {
      name: 'Uso de tus recursos',
      level: 4,
    })
    const block = usage.closest('.ln-budget-usage') as HTMLElement

    expect(
      within(block).getByRole('progressbar', { name: 'Uso de tus recursos' }),
    ).toHaveAttribute('aria-valuenow', '30')
    expect(within(block).getByText('30% utilizado')).toBeInTheDocument()
    expect(within(block).getByLabelText('$1,200.00')).toBeInTheDocument()
    expect(within(block).getByLabelText('$4,000.00')).toBeInTheDocument()
    expect(within(block).getByLabelText('$2,800.00')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Aún no has definido un presupuesto para este periodo.',
      ),
    ).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Ver presupuestos' }),
    ).toHaveAttribute('href', '/plan/presupuestos')
  })

  it('solicita el saldo sin fabricar 0% cuando no hay presupuesto ni referencia', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 0,
        spentCents: 0,
        budgetRemaining: 0,
        configuredBudgetCount: 0,
      }),
      financialSnapshot: createFinancialSnapshotMock({ resourceUsage: null }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    const usage = await screen.findByRole('heading', {
      name: 'Uso de tus recursos',
      level: 4,
    })
    const block = usage.closest('.ln-budget-usage') as HTMLElement

    expect(within(block).queryByRole('progressbar')).toBeNull()
    expect(within(block).queryByText(/0%/)).toBeNull()
    expect(
      within(block).getByText(
        'Para mostrar cuánto de tus recursos has utilizado, primero necesitamos conocer tu saldo actual.',
      ),
    ).toBeInTheDocument()
    const link = within(block).getByRole('link', {
      name: 'Indicar saldo actual',
    })
    expect(link).toHaveAttribute('href', '/saldo/inicial')
    expect(link.tagName).toBe('A')
    expect(link).toHaveClass('ln-button', 'ln-button--secondary')
    expect(link).not.toHaveAttribute('role', 'button')
  })

  it('compone hechos financieros independientes y respeta la jerarquía Home', async () => {
    const period = currentPeriod()
    const result = createApplicationServicesMock({
      activePeriod: period,
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: 100_000,
        projectedAvailableCents: 77_700,
        projectedClosingBalanceCents: 123_400,
        expectedIncomeCents: 22_200,
        committedCents: 33_300,
        projectionHorizonEnd: addDays(TODAY, 30),
      }),
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 9_999_900,
        budgetRemaining: -8_888_800,
      }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    expect(
      await screen.findByRole('heading', { name: 'Situación actual' }),
    ).toBeInTheDocument()
    await screen.findByLabelText('$1,000.00')
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Necesita atención' }),
      ).toBeNull(),
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map(({ textContent }) => textContent?.trim()),
    ).toEqual([
      'Situación actual',
      'Qué viene después',
      'Resumen del plan',
      'Actividad reciente',
    ])
    for (const label of [
      '$1,000.00',
      '$777.00',
      '$1,234.00',
      '$222.00',
      '$333.00',
      '$99,999.00',
      '-$88,888.00, valor negativo',
    ])
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0)
    expect(
      result.services.dashboard.getFinancialSnapshot.execute,
    ).toHaveBeenCalledTimes(1)
    expect(
      result.services.dashboard.getBudgetSummary.execute,
    ).toHaveBeenCalledWith(period, TODAY)
    expect(
      result.services.budgets.getCategoryBudgetSummaries.execute,
    ).toHaveBeenCalledWith({
      ownerId: result.services.ownerId,
      periodId: PERIOD_ID,
    })

    for (const [name, route] of [
      ['Ver proyección', '/plan/proyeccion'],
      ['Ver presupuestos', '/plan/presupuestos'],
      ['Ver compromisos', '/plan/compromisos'],
    ] as const) {
      const link = screen.getByRole('link', { name })

      expect(link).toHaveAttribute('href', route)
      expect(link.tagName).toBe('A')
      expect(link).toHaveClass(
        'ln-button',
        'ln-button--secondary',
        'ln-home-navigation-action',
      )
      expect(link).not.toHaveAttribute('role', 'button')
    }
  })

  it('mantiene saldo y proyecciones unknown sin sustituirlos por cero', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
        projectedAvailableCents: null,
        projectedClosingBalanceCents: null,
      }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    await screen.findByText('Aún sin saldo')
    const situationHeading = screen.getByRole('heading', {
      name: 'Situación actual',
    })
    const situation = situationHeading.closest('section')!
    expect(within(situation).getByText('—')).toBeInTheDocument()
    expect(within(situation).getByText('Aún sin saldo')).toBeInTheDocument()
    expect(
      within(situation).getByRole('link', { name: 'Indicar mi saldo actual' }),
    ).toHaveAttribute('href', '/saldo/inicial')
    expect(screen.getAllByText('No calculable')).toHaveLength(2)
    expect(within(situation).queryByLabelText('$0.00')).toBeNull()
  })

  it('preserva signos negativos en saldo, disponible y cierre', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: -10_001,
        projectedAvailableCents: -20_002,
        projectedClosingBalanceCents: -30_003,
      }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    expect(
      await screen.findByLabelText('-$100.01, valor negativo'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('-$200.02, valor negativo'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('-$300.03, valor negativo'),
    ).toBeInTheDocument()
    expect(screen.getByText('Saldo negativo')).toBeInTheDocument()
  })

  it('muestra máximo tres atenciones en prioridad y usa status de presupuesto', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      financialSnapshot: createFinancialSnapshotMock({
        overdueCommittedCents: 11_100,
        overdueExpectedIncomeCents: 22_200,
      }),
      categoryBudgetSummaries: [
        createCategoryBudgetSummaryMock({
          remainingCents: 999_999,
          status: 'over',
        }),
      ],
    })
    quietSecondaryData(result)
    renderDashboard(result)

    await screen.findByRole('heading', { name: 'Compromisos vencidos' })
    const heading = screen.getByRole('heading', { name: 'Necesita atención' })
    const section = heading.closest('section')!
    expect(
      within(section)
        .getAllByRole('heading', { level: 2 })
        .map(({ textContent }) => textContent?.trim()),
    ).toEqual(['Necesita atención'])
    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent?.trim()),
    ).toEqual([
      'Compromisos vencidos',
      'Ingresos esperados vencidos',
      'Presupuesto excedido: Comida',
    ])
    expect(within(section).getByLabelText('$111.00')).toBeInTheDocument()
    expect(within(section).getByLabelText('$222.00')).toBeInTheDocument()
    expect(
      within(section).getByRole('link', { name: 'Revisar ingresos esperados' }),
    ).toHaveAttribute('href', '/movimientos?tipo=ingresos&estado=esperados')
  })

  it('omite atención cuando no existe ningún asunto accionable', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    expect(
      await screen.findByText('Aún no hay actividad efectiva en este periodo.'),
    ).toBeInTheDocument()
    const activityLink = screen.getByRole('link', {
      name: 'Ver todos los movimientos',
    })
    expect(activityLink).toHaveAttribute('href', '/movimientos')
    expect(activityLink.tagName).toBe('A')
    expect(activityLink).toHaveClass(
      'ln-button',
      'ln-button--secondary',
      'ln-home-navigation-action',
    )
    expect(activityLink).not.toHaveAttribute('role', 'button')
    expect(
      screen.queryByRole('heading', { name: 'Necesita atención' }),
    ).toBeNull()
  })

  it('usa occurrence.amount para el próximo compromiso, no el monto del plan', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    vi.mocked(
      result.services.incomes.listIncomesByPeriod.execute,
    ).mockResolvedValue([])
    vi.mocked(
      result.services.expenses.listExpensesByPeriod.execute,
    ).mockResolvedValue([])
    vi.mocked(
      result.services.recurringPayments.getOverview.execute,
    ).mockResolvedValue({
      payments: [createRecurringPaymentMock({ amount: 90_000 })],
      occurrences: [
        createOccurrenceMock({ amount: 12_345, dueDate: addDays(TODAY, 1) }),
      ],
    })
    renderDashboard(result)

    const next = await screen.findByRole('heading', {
      name: 'Internet',
      level: 3,
    })
    const row = next.closest('article')!
    expect(within(row).getByLabelText('$123.45')).toBeInTheDocument()
    expect(within(row).queryByLabelText('$900.00')).toBeNull()
    expect(row).toHaveTextContent('Mañana')
  })

  it('selecciona el ingreso esperado más cercano y lo comunica como futuro', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    vi.mocked(
      result.services.recurringPayments.getOverview.execute,
    ).mockResolvedValue({
      payments: [],
      occurrences: [],
    })
    vi.mocked(
      result.services.expenses.listExpensesByPeriod.execute,
    ).mockResolvedValue([])
    vi.mocked(
      result.services.incomes.listIncomesByPeriod.execute,
    ).mockResolvedValue([
      createIncomeMock({
        id: 'later',
        description: 'Bono posterior',
        date: addDays(TODAY, 3),
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
      createIncomeMock({
        id: 'nearest',
        description: 'Bono próximo',
        date: addDays(TODAY, 1),
        amount: 45_600,
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
    ])
    renderDashboard(result)

    const next = await screen.findByRole('heading', {
      name: 'Bono próximo',
      level: 3,
    })
    const row = next.closest('article')!
    expect(row).toHaveTextContent('Dinero futuro, todavía no disponible')
    expect(within(row).getByLabelText('$456.00')).toBeInTheDocument()
    expect(screen.queryByText('Bono posterior')).toBeNull()
  })

  it('limita actividad a cinco y conserva el orden determinista de U5', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    vi.mocked(
      result.services.recurringPayments.getOverview.execute,
    ).mockResolvedValue({
      payments: [],
      occurrences: [],
    })
    vi.mocked(
      result.services.incomes.listIncomesByPeriod.execute,
    ).mockResolvedValue([
      createIncomeMock({
        id: 'received',
        description: 'Ingreso efectivo',
        date: addDays(TODAY, 1),
      }),
      createIncomeMock({
        id: 'expected',
        description: 'Expectativa fuera de actividad',
        date: addDays(TODAY, 2),
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
    ])
    vi.mocked(
      result.services.expenses.listExpensesByPeriod.execute,
    ).mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        createExpenseMock({
          id: `expense-${index}`,
          description: `Gasto ${index}`,
          date: addDays(TODAY, -index),
        }),
      ),
    )
    renderDashboard(result)

    await screen.findByRole('heading', { name: 'Ingreso efectivo', level: 3 })
    const heading = screen.getByRole('heading', { name: 'Actividad reciente' })
    const section = heading.closest('section')!
    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(['Ingreso efectivo', 'Gasto 0', 'Gasto 1', 'Gasto 2', 'Gasto 3'])
    expect(
      within(section).queryByText('Expectativa fuera de actividad'),
    ).toBeNull()
    const activityLink = within(section).getByRole('link', {
      name: 'Ver todos los movimientos',
    })
    expect(activityLink).toHaveAttribute('href', '/movimientos')
    expect(activityLink.tagName).toBe('A')
    expect(activityLink).toHaveClass(
      'ln-button',
      'ln-button--secondary',
      'ln-home-navigation-action',
    )
    expect(activityLink).not.toHaveAttribute('role', 'button')
  })

  it('mantiene saldo y actividad disponible cuando falla una fuente secundaria', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    vi.mocked(
      result.services.expenses.listExpensesByPeriod.execute,
    ).mockRejectedValueOnce(new Error('Fallo de gastos'))
    vi.mocked(
      result.services.recurringPayments.getOverview.execute,
    ).mockResolvedValue({
      payments: [],
      occurrences: [],
    })
    renderDashboard(result)

    expect(await screen.findByLabelText('$1,250.00')).toBeInTheDocument()
    expect(await screen.findByText('Actividad parcial')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Sueldo', level: 3 }),
    ).toBeInTheDocument()
  })

  it('un error del snapshot no fabrica ceros ni oculta presupuesto y actividad', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    result.mocks.getFinancialSnapshot.mockRejectedValueOnce(
      new Error('Snapshot no disponible'),
    )
    vi.mocked(
      result.services.recurringPayments.getOverview.execute,
    ).mockResolvedValue({
      payments: [],
      occurrences: [],
    })
    renderDashboard(result)

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos cargar tu situación actual',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No pudimos cargar la proyección' }),
    ).toBeInTheDocument()
    expect(screen.getAllByLabelText('$1,000.00').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', { name: 'Sueldo', level: 3 }),
    ).toBeInTheDocument()
  })

  it('localiza y reintenta el error de recursos cuando no hay presupuesto', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 0,
        spentCents: 0,
        budgetRemaining: 0,
        configuredBudgetCount: 0,
      }),
    })
    quietSecondaryData(result)
    result.mocks.getFinancialSnapshot.mockRejectedValueOnce(
      new Error('Recursos no disponibles'),
    )
    renderDashboard(result)

    const heading = await screen.findByRole('heading', {
      name: 'No pudimos cargar el uso de tus recursos',
    })
    const state = heading.closest('[role="alert"]') as HTMLElement
    expect(screen.queryByText(/0% utilizado/)).toBeNull()

    await user.click(within(state).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() =>
      expect(result.mocks.getFinancialSnapshot).toHaveBeenCalledTimes(2),
    )
    expect(
      await screen.findByRole('heading', { name: 'Uso de tus recursos' }),
    ).toBeInTheDocument()
  })

  it('un error de presupuesto permanece local y no se representa como 0%', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    quietSecondaryData(result)
    result.mocks.getBudgetSummary.mockRejectedValueOnce(
      new Error('Presupuesto no disponible'),
    )
    renderDashboard(result)

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos cargar el resumen de presupuesto',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Situación actual' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Actividad reciente' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/0% utilizado/)).toBeNull()
  })

  it('presenta horizonte y cobertura limitada sin rederivarlos', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
      financialSnapshot: createFinancialSnapshotMock({
        projectionHorizonEnd: null,
        projectionCoverage: 'overdue_only',
      }),
    })
    quietSecondaryData(result)
    renderDashboard(result)

    expect(await screen.findByText('Cobertura limitada')).toBeInTheDocument()
    expect(
      screen.getByText('Sin horizonte de periodo vigente'),
    ).toBeInTheDocument()
  })

  it('reintenta únicamente la autoridad principal después de un error', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    quietSecondaryData(result)
    result.mocks.getFinancialSnapshot.mockRejectedValueOnce(
      new Error('Fallo controlado'),
    )
    renderDashboard(result)

    const situation = await screen.findByRole('heading', {
      name: 'No pudimos cargar tu situación actual',
    })
    await user.click(
      within(situation.closest('section')!).getByRole('button', {
        name: 'Reintentar',
      }),
    )
    await waitFor(() =>
      expect(result.mocks.getFinancialSnapshot).toHaveBeenCalledTimes(2),
    )
    expect(await screen.findByLabelText('$1,250.00')).toBeInTheDocument()
  })

  it('preserva el resolutor inicial cuando no existe periodo utilizable', async () => {
    const result = createApplicationServicesMock({ activePeriod: null })
    renderDashboard(result)
    expect(
      await screen.findByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeInTheDocument()
    expect(result.mocks.getFinancialSnapshot).not.toHaveBeenCalled()
  })

  it('mantiene /dashboard como redirección segura a /inicio', async () => {
    const result = createApplicationServicesMock({
      activePeriod: currentPeriod(),
    })
    quietSecondaryData(result)
    renderDashboard(result, '/dashboard')
    expect(
      await screen.findByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/inicio')
  })
})
