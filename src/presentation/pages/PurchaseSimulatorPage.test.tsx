import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from '../App'
import {
  CATEGORY_ID,
  createApplicationServicesMock,
} from '../test/test-factories'

function renderSimulator(
  services: ReturnType<typeof createApplicationServicesMock>['services'],
) {
  window.history.replaceState({}, '', '/simulator')
  return render(<App services={services} />)
}

async function simulate(
  user: ReturnType<typeof userEvent.setup>,
  amount = '100.00',
) {
  await screen.findByRole('option', { name: 'Comida' })
  await user.type(screen.getByLabelText('Monto de la compra'), amount)
  await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
}

describe('PurchaseSimulatorPage', () => {
  it('muestra un resultado normal sin persistirlo', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    renderSimulator(services)
    await simulate(user)
    expect(
      await screen.findByText(
        'Esta compra se mantiene dentro de tu dinero disponible actual.',
      ),
    ).toBeInTheDocument()
    expect(mocks.createExpense).not.toHaveBeenCalled()
  })

  it('muestra texto explícito cuando el resultado es negativo', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    services.simulator.simulatePurchase.execute = vi
      .fn<typeof services.simulator.simulatePurchase.execute>()
      .mockResolvedValue({
        currentAvailable: 5000,
        afterPurchaseAvailable: -5000,
        categoryBudgetRemaining: -1000,
        isNegative: true,
        categoryBudgetBefore: 0,
        categoryBudgetAfter: -10000,
      })
    renderSimulator(services)
    await simulate(user)
    expect(
      await screen.findByText(
        'Esta compra dejaría tu dinero disponible en negativo.',
      ),
    ).toBeInTheDocument()
  })

  it('valida montos inválidos y no muestra resultados engañosos', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    renderSimulator(services)
    await simulate(user, '12.345')
    expect(
      screen.getByText('Escribe un monto positivo con máximo dos decimales.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Esta compra se mantiene dentro de tu dinero disponible actual.',
      ),
    ).not.toBeInTheDocument()
  })

  it('requiere confirmación antes de convertir la simulación en gasto', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    renderSimulator(services)
    await simulate(user)
    await user.click(
      await screen.findByRole('button', { name: 'Convertir en gasto' }),
    )
    await user.type(screen.getByLabelText('Descripción'), 'Compra simulada')
    await user.clear(screen.getByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-07-20')
    await user.click(screen.getByRole('button', { name: 'Revisar gasto' }))
    expect(mocks.createExpense).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(mocks.createExpense).toHaveBeenCalledTimes(1)
    expect(mocks.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        categoryId: CATEGORY_ID,
        description: 'Compra simulada',
      }),
    )
  })

  it('asocia los errores de conversión con sus controles', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    renderSimulator(services)
    await simulate(user)
    await user.click(
      await screen.findByRole('button', { name: 'Convertir en gasto' }),
    )
    await user.clear(screen.getByLabelText('Fecha'))

    await user.click(screen.getByRole('button', { name: 'Revisar gasto' }))

    expect(screen.getByLabelText('Descripción')).toHaveAttribute(
      'aria-describedby',
      'conversion-description-error',
    )
    expect(screen.getByLabelText('Fecha')).toHaveAttribute(
      'aria-describedby',
      'conversion-date-error',
    )
    expect(
      screen.queryByText(/Too small|Invalid string/i),
    ).not.toBeInTheDocument()
  })
})
