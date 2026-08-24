import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { DashboardBudgetSummary } from '@application/use-cases/dashboard/GetDashboardBudgetSummary'
import type { ResourceUsageSummary } from '@application/use-cases/dashboard/GetResourceUsageSummary'
import { createInstant } from '@domain/value-objects'
import { HomeUsageProgress } from './HomeUsageProgress'

type BudgetUsageFacts = Pick<
  DashboardBudgetSummary,
  'budgetRemaining' | 'spentCents' | 'totalBudget'
>

const budgetFacts = (
  overrides: Partial<BudgetUsageFacts> = {},
): BudgetUsageFacts => ({
  totalBudget: 500_000,
  spentCents: 320_000,
  budgetRemaining: 180_000,
  ...overrides,
})

const resourceFacts = (
  overrides: Partial<ResourceUsageSummary> = {},
): ResourceUsageSummary => ({
  referenceAt: createInstant('2026-08-01T12:00:00.000Z'),
  resourceBaseCents: 400_000,
  spentCents: 120_000,
  currentAvailableCents: 280_000,
  canCalculatePercentage: true,
  status: 'available',
  ...overrides,
})

function renderUsage(element: ReactNode) {
  render(<MemoryRouter>{element}</MemoryRouter>)
}

describe('HomeUsageProgress', () => {
  it('presenta el presupuesto normal con porcentaje y hechos autoritativos', () => {
    renderUsage(<HomeUsageProgress mode="budget" facts={budgetFacts()} />)

    const progress = screen.getByRole('progressbar', {
      name: 'Uso del presupuesto',
    })
    expect(progress).toHaveAttribute('value', '64')
    expect(progress).toHaveAttribute('aria-valuenow', '64')
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      '64% del presupuesto utilizado. Restante $1,800.00.',
    )
    expect(screen.getByText('64% utilizado')).toBeInTheDocument()
    expect(screen.getByLabelText('$3,200.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$5,000.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$1,800.00')).toBeInTheDocument()
  })

  it('presenta exactamente 100% del presupuesto sin marcar excedente', () => {
    renderUsage(
      <HomeUsageProgress
        mode="budget"
        facts={budgetFacts({ spentCents: 500_000, budgetRemaining: 0 })}
      />,
    )

    expect(screen.getByText('100% utilizado')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100')
    expect(screen.getByText('Quedan')).toContainElement(
      screen.getByLabelText('$0.00'),
    )
    expect(screen.queryByText('Presupuesto excedido')).toBeNull()
  })

  it('conserva 115% del presupuesto y limita sólo la barra', () => {
    renderUsage(
      <HomeUsageProgress
        mode="budget"
        facts={budgetFacts({
          spentCents: 575_000,
          budgetRemaining: -75_000,
        })}
      />,
    )

    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('value', '100')
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      '115% del presupuesto utilizado. Presupuesto excedido. Restante -$750.00.',
    )
    expect(screen.getByText('115% utilizado')).toBeInTheDocument()
    expect(screen.getByText('Presupuesto excedido')).toBeInTheDocument()
    expect(
      screen.getByLabelText('-$750.00, valor negativo'),
    ).toBeInTheDocument()
  })

  it('evita división por cero en un presupuesto configurado en cero', () => {
    renderUsage(
      <HomeUsageProgress
        mode="budget"
        facts={budgetFacts({
          totalBudget: 0,
          spentCents: 12_345,
          budgetRemaining: -12_345,
        })}
      />,
    )

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText(/porcentaje aplicable/i)).toBeInTheDocument()
    expect(screen.getByText('Presupuesto excedido')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/)
  })

  it('no reconstruye el restante del presupuesto', () => {
    renderUsage(
      <HomeUsageProgress
        mode="budget"
        facts={budgetFacts({ budgetRemaining: 777 })}
      />,
    )

    const block = screen
      .getByRole('heading', { name: 'Uso del presupuesto' })
      .closest('div')!
    expect(within(block).getByText('64% utilizado')).toBeInTheDocument()
    expect(within(block).getByLabelText('$7.77')).toBeInTheDocument()
  })

  it('presenta recursos normales con 30% y el contexto de la referencia', () => {
    renderUsage(<HomeUsageProgress mode="resources" facts={resourceFacts()} />)

    const progress = screen.getByRole('progressbar', {
      name: 'Uso de tus recursos',
    })
    expect(progress).toHaveAttribute('value', '30')
    expect(progress).toHaveAttribute('aria-valuenow', '30')
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      '30% de los recursos utilizados. $1,200.00 utilizados de $4,000.00. Actualmente disponibles $2,800.00.',
    )
    expect(
      screen.getByText('Desde tu última referencia de saldo.'),
    ).toBeInTheDocument()
    expect(screen.getByText('30% utilizado')).toBeInTheDocument()
    expect(screen.getByLabelText('$1,200.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$4,000.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$2,800.00')).toBeInTheDocument()
  })

  it('conserva recursos al 125%, limita sólo la barra y muestra saldo negativo', () => {
    renderUsage(
      <HomeUsageProgress
        mode="resources"
        facts={resourceFacts({
          spentCents: 500_000,
          currentAvailableCents: -100_000,
          status: 'negative',
        })}
      />,
    )

    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('value', '100')
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      '125% de los recursos utilizados. $5,000.00 utilizados de $4,000.00. Actualmente disponibles -$1,000.00.',
    )
    expect(screen.getByText('125% utilizado')).toBeInTheDocument()
    expect(screen.getByText('Recursos excedidos')).toBeInTheDocument()
    expect(
      screen.getByLabelText('-$1,000.00, valor negativo'),
    ).toBeInTheDocument()
  })

  it.each([
    ['cero', 0],
    ['negativa', -10_000],
  ])('presenta base %s sin porcentaje falso', (_label, resourceBaseCents) => {
    renderUsage(
      <HomeUsageProgress
        mode="resources"
        facts={resourceFacts({
          resourceBaseCents,
          currentAvailableCents: resourceBaseCents - 20_000,
          spentCents: 20_000,
          canCalculatePercentage: false,
          status: 'negative',
        })}
      />,
    )

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/0%/)).toBeNull()
    expect(screen.getByText(/porcentaje aplicable/i)).toBeInTheDocument()
    expect(screen.getByLabelText('$200.00')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/)
  })

  it('consume saldo actual y base como hechos independientes', () => {
    renderUsage(
      <HomeUsageProgress
        mode="resources"
        facts={resourceFacts({ currentAvailableCents: 77_700 })}
      />,
    )

    expect(screen.getByText('30% utilizado')).toBeInTheDocument()
    expect(screen.getByLabelText('$777.00')).toBeInTheDocument()
    expect(screen.queryByLabelText('$2,800.00')).toBeNull()
  })

  it('presenta el estado desconocido sin barra y con enlace canónico', () => {
    renderUsage(<HomeUsageProgress mode="unknown" />)

    expect(
      screen.getByRole('heading', { name: 'Uso de tus recursos' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Para mostrar cuánto de tus recursos has utilizado, primero necesitamos conocer tu saldo actual.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/0%/)).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Indicar saldo actual' }),
    ).toHaveAttribute('href', '/saldo/inicial')
  })
})
