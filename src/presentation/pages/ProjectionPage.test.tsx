import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApplicationServices } from '../../app/composition-root'
import { App } from '../App'
import {
  createApplicationServicesMock,
  createFinancialSnapshotMock,
} from '../test/test-factories'

const APP_READY_TIMEOUT_MS = 3_000

const availability = vi.hoisted(() => ({ value: true }))

vi.mock('../hooks/useAIAvailability', () => ({
  useAIAvailability: () => availability.value,
}))

type ExplainPlanning = NonNullable<
  ApplicationServices['aiInsights']
>['explainPlanning']['execute']

const planningResponse = {
  summary: 'La proyección refleja los hechos proporcionados.',
  observations: ['Los compromisos influyen en el disponible.'],
  considerations: ['El cierre proyectado es una estimación.'],
}

function renderProjection(financialSnapshot = createFinancialSnapshotMock()) {
  window.history.replaceState({}, '', '/plan/proyeccion')
  const result = createApplicationServicesMock({ financialSnapshot })
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, view }
}

function renderProjectionWithAI({
  financialSnapshot = createFinancialSnapshotMock(),
  explain = vi.fn<ExplainPlanning>().mockResolvedValue(planningResponse),
}: {
  financialSnapshot?: ReturnType<typeof createFinancialSnapshotMock>
  explain?: ExplainPlanning
} = {}) {
  window.history.replaceState({}, '', '/plan/proyeccion')
  const result = createApplicationServicesMock({ financialSnapshot })
  result.services.aiInsights = {
    suggestExpenseCategory: { execute: vi.fn() },
    generatePeriodSummary: { execute: vi.fn() },
    explainCategoryChanges: { execute: vi.fn() },
    explainPlanning: { execute: explain },
  }
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, view, explain }
}

describe('ProjectionPage', () => {
  beforeEach(() => {
    availability.value = true
  })

  it('presenta directamente todos los factores autoritativos con cobertura completa', async () => {
    renderProjection(
      createFinancialSnapshotMock({
        currentBalanceCents: 100_000,
        projectedAvailableCents: 40_000,
        projectedClosingBalanceCents: 65_000,
        expectedIncomeCents: 25_000,
        committedCents: 60_000,
        overdueCommittedCents: 10_000,
        projectionHorizonEnd: '2026-07-31',
        projectionCoverage: 'full_period',
      }),
    )

    expect(
      await screen.findByText(
        'Saldo actual de referencia',
        {},
        { timeout: APP_READY_TIMEOUT_MS },
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Disponible después de compromisos'),
    ).toBeInTheDocument()
    expect(screen.getByText('Saldo estimado al cierre')).toBeInTheDocument()
    expect(screen.getByLabelText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$400.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$650.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$250.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$600.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$100.00')).toBeInTheDocument()
    expect(screen.getByText('Periodo completo')).toBeInTheDocument()
    expect(
      screen.getByText('Proyección hasta 31 de julio de 2026'),
    ).toBeInTheDocument()
    expect(screen.queryByText('full_period')).toBeNull()
  })

  it('mantiene unknown como No calculable y ofrece indicar saldo', async () => {
    renderProjection(
      createFinancialSnapshotMock({
        currentBalanceCents: null,
        projectedAvailableCents: null,
        projectedClosingBalanceCents: null,
      }),
    )

    await screen.findByRole('heading', {
      name: 'Necesitamos un saldo actual para proyectar',
    })
    expect(screen.getAllByText('No calculable')).toHaveLength(3)
    const results = screen.getByRole('region', {
      name: 'Resultados de la proyección',
    })
    expect(within(results).queryByLabelText('$0.00')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Indicar mi saldo actual' }),
    ).toHaveAttribute('href', '/saldo/inicial')
  })

  it('preserva valores negativos firmados y añade contexto humano', async () => {
    renderProjection(
      createFinancialSnapshotMock({
        currentBalanceCents: -10_000,
        projectedAvailableCents: -20_000,
        projectedClosingBalanceCents: -5_000,
      }),
    )

    await screen.findByLabelText('-$200.00, valor negativo')
    expect(
      screen.getByLabelText('-$200.00, valor negativo'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('-$50.00, valor negativo')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'El disponible proyectado es negativo',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'El cierre estimado es negativo' }),
    ).toBeInTheDocument()
  })

  it('explica cobertura overdue_only sin mostrar el valor crudo', async () => {
    renderProjection(
      createFinancialSnapshotMock({
        committedCents: 20_000,
        overdueCommittedCents: 20_000,
        expectedIncomeCents: 0,
        projectionHorizonEnd: null,
        projectionCoverage: 'overdue_only',
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Cobertura limitada' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Sin horizonte de periodo vigente'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/Sólo incluye compromisos vencidos/).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('overdue_only')).toBeNull()
  })

  it('muestra error recuperable y reintenta el snapshot sin sustituirlo por ceros', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    vi.mocked(
      result.services.dashboard.getFinancialSnapshot.execute,
    ).mockRejectedValueOnce(new Error('snapshot unavailable'))
    window.history.replaceState({}, '', '/plan/proyeccion')
    render(<App services={result.services} authServices={null} />)

    expect(
      await screen.findByText(
        'No pudimos calcular tu proyección con los datos actuales.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByText('Disponible después de compromisos'),
    ).toBeInTheDocument()
  })

  it('solicita la explicación sólo tras la acción explícita y no al rerenderizar', async () => {
    const user = userEvent.setup()
    const result = renderProjectionWithAI()

    expect(
      await screen.findByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    ).toBeInTheDocument()
    expect(result.explain).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    await screen.findByLabelText('Explicación generada por IA')
    expect(result.explain).toHaveBeenCalledTimes(1)
    expect(result.explain).toHaveBeenCalledWith(createFinancialSnapshotMock())

    result.view.rerender(<App services={result.services} authServices={null} />)
    expect(result.explain).toHaveBeenCalledTimes(1)
  })

  it('separa el éxito de IA y conserva intactos los hechos autoritativos', async () => {
    const user = userEvent.setup()
    const facts = createFinancialSnapshotMock({
      currentBalanceCents: 100_000,
      projectedAvailableCents: 77_777,
      projectedClosingBalanceCents: -12_345,
      expectedIncomeCents: 33_333,
      committedCents: 22_222,
    })
    renderProjectionWithAI({
      financialSnapshot: facts,
      explain: vi.fn<ExplainPlanning>().mockResolvedValue({
        summary: 'Tu saldo real es $9,999.00.',
        observations: ['La IA contradice deliberadamente los datos.'],
        considerations: ['No sustituir las cifras de Lunumia.'],
      }),
    })

    await user.click(
      await screen.findByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    const generated = await screen.findByLabelText(
      'Explicación generada por IA',
    )
    expect(within(generated).getByText('Resumen')).toBeInTheDocument()
    expect(within(generated).getAllByRole('list')).toHaveLength(2)
    expect(screen.getByLabelText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$777.77')).toBeInTheDocument()
    expect(
      screen.getByLabelText('-$123.45, valor negativo'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('$333.33')).toBeInTheDocument()
    expect(screen.getByLabelText('$222.22')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Esta explicación no modifica tus datos ni sustituye tus decisiones.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/se envía un resumen/)).toBeInTheDocument()
    const scope = screen.getByRole('heading', {
      name: 'Horizonte y cobertura',
    })
    const aiHeading = screen.getByRole('heading', {
      name: 'Explicación con IA',
    })
    expect(
      scope.compareDocumentPosition(aiHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('mantiene el loading local, desactiva el CTA y evita solicitudes duplicadas', async () => {
    const user = userEvent.setup()
    let resolve!: (value: typeof planningResponse) => void
    const explain = vi.fn<ExplainPlanning>(
      () =>
        new Promise<typeof planningResponse>((next) => {
          resolve = next
        }),
    )
    renderProjectionWithAI({ explain })

    await user.click(
      await screen.findByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    const pending = screen.getByRole('button', {
      name: 'Interpretando tu proyección…',
    })
    expect(pending).toBeDisabled()
    expect(screen.getByText('Saldo actual de referencia')).toBeInTheDocument()
    expect(
      screen.getByText('Generando únicamente la explicación…'),
    ).toBeInTheDocument()
    await user.click(pending)
    expect(explain).toHaveBeenCalledOnce()

    resolve(planningResponse)
    await screen.findByLabelText('Explicación generada por IA')
  })

  it('aísla errores y permite reintentar con el snapshot actual', async () => {
    const user = userEvent.setup()
    const explain = vi
      .fn<ExplainPlanning>()
      .mockRejectedValueOnce({ code: 'provider_timeout' })
      .mockResolvedValueOnce(planningResponse)
    renderProjectionWithAI({ explain })

    await user.click(
      await screen.findByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    expect(
      await screen.findByText('No pudimos generar la explicación'),
    ).toBeInTheDocument()
    expect(screen.getByText(/La respuesta tardó demasiado/)).toBeInTheDocument()
    expect(screen.getByLabelText('$1,250.00')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Reintentar explicación' }),
    )
    await screen.findByLabelText('Explicación generada por IA')
    expect(explain).toHaveBeenCalledTimes(2)
  })

  it('bloquea contexto insuficiente sin invocar IA ni inventar cero', async () => {
    const explain = vi.fn<ExplainPlanning>().mockResolvedValue(planningResponse)
    renderProjectionWithAI({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: null,
        projectedAvailableCents: null,
        projectedClosingBalanceCents: null,
      }),
      explain,
    })

    const cta = await screen.findByRole('button', {
      name: 'Ayúdame a interpretar este plan',
    })
    expect(cta).toBeDisabled()
    expect(
      screen.getByText(
        'Para interpretar esta proyección primero necesitamos conocer tu saldo actual.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Indicar saldo actual' }),
    ).toHaveAttribute('href', '/saldo/inicial')
    const results = screen.getByRole('region', {
      name: 'Resultados de la proyección',
    })
    expect(within(results).queryByLabelText('$0.00')).toBeNull()
    expect(explain).not.toHaveBeenCalled()
  })

  it('permite valores negativos y cobertura limitada cuando el horizonte es conocido', async () => {
    const user = userEvent.setup()
    const explain = vi.fn<ExplainPlanning>().mockResolvedValue(planningResponse)
    renderProjectionWithAI({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: -10_000,
        projectedAvailableCents: -20_000,
        projectedClosingBalanceCents: -5_000,
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: '2026-07-31',
      }),
      explain,
    })

    expect(
      await screen.findByRole('heading', { name: 'Cobertura limitada' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    expect(explain).toHaveBeenCalledOnce()
    expect(
      screen.getByLabelText('-$100.00, valor negativo'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('-$200.00, valor negativo'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Periodo completo')).toBeNull()
  })

  it('descarta una explicación anterior cuando cambia el snapshot sin regenerar', async () => {
    const user = userEvent.setup()
    const explain = vi.fn<ExplainPlanning>().mockResolvedValue(planningResponse)
    const initial = renderProjectionWithAI({ explain })

    await user.click(
      await screen.findByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    expect(
      await screen.findByText(planningResponse.summary),
    ).toBeInTheDocument()

    const next = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        currentBalanceCents: 200_000,
        projectedAvailableCents: 190_000,
        projectedClosingBalanceCents: 190_000,
      }),
    })
    next.services.aiInsights = {
      suggestExpenseCategory: { execute: vi.fn() },
      generatePeriodSummary: { execute: vi.fn() },
      explainCategoryChanges: { execute: vi.fn() },
      explainPlanning: { execute: explain },
    }
    initial.view.rerender(<App services={next.services} authServices={null} />)

    await screen.findByLabelText('$2,000.00')
    await waitFor(() =>
      expect(screen.queryByText(planningResponse.summary)).toBeNull(),
    )
    expect(explain).toHaveBeenCalledOnce()
  })

  it('anuncia el éxito una sola vez sin mover el foco', async () => {
    const user = userEvent.setup()
    renderProjectionWithAI()
    const cta = await screen.findByRole('button', {
      name: 'Ayúdame a interpretar este plan',
    })
    act(() => cta.focus())

    await user.click(cta)

    const announcement = await screen.findByText('La explicación está lista.')
    expect(announcement).toHaveAttribute('role', 'status')
    expect(screen.getAllByText('La explicación está lista.')).toHaveLength(1)
    expect(document.activeElement).toHaveTextContent('Interpretar de nuevo')
  })

  it('renderiza los límites máximos de texto sin recortar el contenido', async () => {
    const user = userEvent.setup()
    const summary = 'S'.repeat(600)
    const observation = 'O'.repeat(200)
    const consideration = 'C'.repeat(200)
    renderProjectionWithAI({
      explain: vi.fn<ExplainPlanning>().mockResolvedValue({
        summary,
        observations: Array(4).fill(observation),
        considerations: Array(3).fill(consideration),
      }),
    })

    await user.click(
      await screen.findByRole('button', {
        name: 'Ayúdame a interpretar este plan',
      }),
    )
    expect(await screen.findByText(summary)).toBeInTheDocument()
    expect(screen.getAllByText(observation)).toHaveLength(4)
    expect(screen.getAllByText(consideration)).toHaveLength(3)
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
  })
})
