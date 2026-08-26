import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from '../App'
import {
  CATEGORY_ID,
  createApplicationServicesMock,
} from '../test/test-factories'

const APP_READY_TIMEOUT_MS = 3_000

function renderSimulator(
  services: ReturnType<typeof createApplicationServicesMock>['services'],
) {
  window.history.replaceState({}, '', '/simulador')
  return render(<App services={services} />)
}

async function simulate(
  user: ReturnType<typeof userEvent.setup>,
  amount = '100.00',
) {
  await screen.findByRole(
    'option',
    { name: 'Comida' },
    { timeout: APP_READY_TIMEOUT_MS },
  )
  await user.type(screen.getByLabelText(/Monto de la compra/), amount)
  await user.selectOptions(screen.getByLabelText(/Categoría/), CATEGORY_ID)
  await user.click(screen.getByRole('button', { name: 'Simular compra' }))
}

describe('PurchaseSimulatorPage', () => {
  it('muestra un resultado normal sin persistirlo', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    renderSimulator(services)
    await simulate(user)
    expect(
      await screen.findByText(
        'Dentro de tu disponible.',
        {},
        { timeout: APP_READY_TIMEOUT_MS },
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
        projectedAvailableBeforePurchase: 5000,
        projectedAvailableAfterPurchase: -5000,
        financialAffordability: 'exceeds',
        categoryBudgetBefore: 0,
        categoryBudgetAfter: -10000,
        budgetFit: 'exceeds',
        projectionCoverage: 'full_period',
        projectionHorizonEnd: '2026-07-31',
      })
    renderSimulator(services)
    await simulate(user)
    expect(
      await screen.findByText('Dejaría tu disponible en negativo.'),
    ).toBeInTheDocument()
  })

  it('no convierte un saldo desconocido en cero', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    services.simulator.simulatePurchase.execute = vi
      .fn<typeof services.simulator.simulatePurchase.execute>()
      .mockResolvedValue({
        projectedAvailableBeforePurchase: null,
        projectedAvailableAfterPurchase: null,
        financialAffordability: 'unknown',
        categoryBudgetBefore: 5000,
        categoryBudgetAfter: 4000,
        budgetFit: 'within',
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: null,
      })
    renderSimulator(services)
    await simulate(user)

    expect(await screen.findAllByText('No calculable')).toHaveLength(2)
    expect(
      screen.getByText('No podemos evaluarla hasta conocer tu saldo.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'La proyección disponible sólo cubre compromisos vencidos.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('$50.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$40.00')).toBeInTheDocument()
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
      screen.queryByText('Dentro de tu disponible.'),
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
    await user.type(screen.getByLabelText(/Descripción/), 'Compra simulada')
    await user.clear(screen.getByLabelText(/Fecha/))
    await user.type(screen.getByLabelText(/Fecha/), '2026-07-20')
    await user.click(
      screen.getByRole('button', { name: 'Revisar y confirmar' }),
    )
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
    await user.clear(screen.getByLabelText(/Fecha/))

    await user.click(
      screen.getByRole('button', { name: 'Revisar y confirmar' }),
    )

    expect(screen.getByLabelText(/Descripción/)).toHaveAttribute(
      'aria-describedby',
      'conversion-description-error',
    )
    expect(screen.getByLabelText(/Fecha/)).toHaveAttribute(
      'aria-describedby',
      'conversion-date-error',
    )
    expect(
      screen.queryByText(/Too small|Invalid string/i),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['within', 'Dentro del presupuesto disponible de la categoría.'],
    ['exceeds', 'Supera el presupuesto disponible de la categoría.'],
    [
      'not_configured',
      'No hay un presupuesto configurado para esta categoría.',
    ],
  ] as const)(
    'presenta el resultado de presupuesto %s',
    async (budgetFit, copy) => {
      const user = userEvent.setup()
      const { services } = createApplicationServicesMock()
      services.simulator.simulatePurchase.execute = vi
        .fn<typeof services.simulator.simulatePurchase.execute>()
        .mockResolvedValue({
          projectedAvailableBeforePurchase: 5000,
          projectedAvailableAfterPurchase: 4000,
          financialAffordability: 'within',
          categoryBudgetBefore: budgetFit === 'not_configured' ? null : 1000,
          categoryBudgetAfter:
            budgetFit === 'not_configured'
              ? null
              : budgetFit === 'exceeds'
                ? -9999
                : 1,
          budgetFit,
          projectionCoverage: 'full_period',
          projectionHorizonEnd: '2026-07-31',
        })
      renderSimulator(services)
      await simulate(user)
      expect(await screen.findByText(copy)).toBeInTheDocument()
    },
  )

  it('presenta la clasificación autoritativa aunque los montos parezcan contradecirla', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    services.simulator.simulatePurchase.execute = vi
      .fn<typeof services.simulator.simulatePurchase.execute>()
      .mockResolvedValue({
        projectedAvailableBeforePurchase: 1,
        projectedAvailableAfterPurchase: -999999,
        financialAffordability: 'within',
        categoryBudgetBefore: 1,
        categoryBudgetAfter: -999999,
        budgetFit: 'within',
        projectionCoverage: 'full_period',
        projectionHorizonEnd: '2026-07-31',
      })
    renderSimulator(services)
    await simulate(user)
    expect(
      await screen.findByText('Dentro de tu disponible.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Dentro del presupuesto disponible de la categoría.'),
    ).toBeInTheDocument()
  })
})
