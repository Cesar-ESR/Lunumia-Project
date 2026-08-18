import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import {
  createApplicationServicesMock,
  createDashboardBudgetSummaryMock,
  createFinancialSnapshotMock,
} from '../test/test-factories'

function renderDashboard(
  services: ReturnType<typeof createApplicationServicesMock>['services'],
) {
  window.history.replaceState({}, '', '/dashboard')
  return render(<App services={services} />)
}

describe('DashboardPage', () => {
  it('muestra el resumen financiero calculado', async () => {
    const { services } = createApplicationServicesMock()
    renderDashboard(services)
    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(await screen.findByText('Presupuesto restante')).toBeInTheDocument()
    expect(screen.getByText('Compromisos pendientes')).toBeInTheDocument()
    expect(screen.getByText('Gastos del periodo')).toBeInTheDocument()
    expect(screen.getByText('Dinero disponible proyectado')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bajo' })).toBeInTheDocument()
  })

  it('muestra el snapshot sin inventar un periodo activo', async () => {
    const { services, mocks } = createApplicationServicesMock({
      activePeriod: null,
      financialSnapshot: createFinancialSnapshotMock({
        projectionHorizonEnd: null,
        projectionCoverage: 'overdue_only',
      }),
    })
    renderDashboard(services)
    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(screen.queryByText('Presupuesto restante')).not.toBeInTheDocument()
    expect(mocks.getFinancialSnapshot).toHaveBeenCalledOnce()
    expect(mocks.getBudgetSummary).not.toHaveBeenCalled()
  })

  it('comunica explícitamente un ritmo alto', async () => {
    const budgetSummary = createDashboardBudgetSummaryMock({
      spendingPace: { spentPercentage: 85, timePercentage: 40, pace: 'high' },
    })
    const { services } = createApplicationServicesMock({ budgetSummary })
    renderDashboard(services)
    expect(
      await screen.findByText(/Tu ritmo de gasto es alto/),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alto' })).toBeInTheDocument()
  })

  it('permite reintentar después de un error de carga', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    mocks.getFinancialSnapshot.mockRejectedValueOnce(
      new Error('Fallo controlado'),
    )
    renderDashboard(services)
    expect(await screen.findByText('Fallo controlado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(mocks.getFinancialSnapshot).toHaveBeenCalledTimes(2)
  })

  it('representa exactamente las métricas del snapshot autoritativo', async () => {
    const { services, mocks } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: 987654,
        spentCents: 12345,
        committedCents: 45678,
        upcomingCommittedCents: 34567,
        overdueCommittedCents: 11111,
        projectedAvailableCents: 941976,
        expectedIncomeCents: 22222,
        overdueExpectedIncomeCents: 33333,
      }),
    })
    renderDashboard(services)

    expect(await screen.findByLabelText('$9,876.54')).toBeInTheDocument()
    expect(screen.getByLabelText('$123.45')).toBeInTheDocument()
    expect(screen.getByLabelText('$456.78')).toBeInTheDocument()
    expect(screen.getByLabelText('$345.67')).toBeInTheDocument()
    expect(screen.getByLabelText('$111.11')).toBeInTheDocument()
    expect(screen.getByLabelText('$9,419.76')).toBeInTheDocument()
    expect(screen.getByLabelText('$222.22')).toBeInTheDocument()
    expect(screen.getByLabelText('$333.33')).toBeInTheDocument()
    expect(mocks.getFinancialSnapshot).toHaveBeenCalled()
  })

  it('no convierte un saldo desconocido en cero', async () => {
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
        projectedAvailableCents: null,
        projectedClosingBalanceCents: null,
      }),
    })
    renderDashboard(services)

    expect(await screen.findAllByText('No configurado')).toHaveLength(2)
  })

  it('mantiene las métricas centrales independientes del presupuesto', async () => {
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: 777777,
        committedCents: 33333,
        projectedAvailableCents: 744444,
      }),
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 99999999,
        budgetRemaining: -88888888,
      }),
    })
    renderDashboard(services)

    expect(await screen.findByLabelText('$7,777.77')).toBeInTheDocument()
    expect(screen.getByLabelText('$333.33')).toBeInTheDocument()
    expect(screen.getByLabelText('$7,444.44')).toBeInTheDocument()
  })
})
