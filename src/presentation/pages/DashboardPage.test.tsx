import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import {
  createApplicationServicesMock,
  createDashboardSummaryMock,
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
    expect(screen.getByText('Presupuesto restante')).toBeInTheDocument()
    expect(screen.getByText('Compromisos pendientes')).toBeInTheDocument()
    expect(screen.getByText('Dinero disponible real')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bajo' })).toBeInTheDocument()
  })

  it('muestra un estado vacío sin periodo activo', async () => {
    const { services } = createApplicationServicesMock({ activePeriod: null })
    renderDashboard(services)
    expect(
      await screen.findByRole('heading', {
        name: 'Aún no hay un periodo activo',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Saldo actual')).not.toBeInTheDocument()
  })

  it('comunica explícitamente un ritmo alto', async () => {
    const summary = createDashboardSummaryMock({
      spendingPace: { spentPercentage: 85, timePercentage: 40, pace: 'high' },
    })
    const { services } = createApplicationServicesMock({ summary })
    renderDashboard(services)
    expect(
      await screen.findByText(/Tu ritmo de gasto es alto/),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alto' })).toBeInTheDocument()
  })

  it('permite reintentar después de un error de carga', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    mocks.getSummary.mockRejectedValueOnce(new Error('Fallo controlado'))
    renderDashboard(services)
    expect(await screen.findByText('Fallo controlado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(mocks.getSummary).toHaveBeenCalledTimes(2)
  })
})
