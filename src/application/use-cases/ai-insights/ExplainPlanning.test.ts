import type { FinancialSnapshot } from '@domain/calculations'
import type { AIInsightsProvider } from '@domain/ports'
import { ExplainPlanning } from './ExplainPlanning'

const snapshot: FinancialSnapshot = {
  openingBalanceCents: 0,
  currentBalanceCents: 100_000,
  spentCents: 91_919,
  committedCents: 22_222,
  upcomingCommittedCents: 20_000,
  overdueCommittedCents: 2_222,
  projectedAvailableCents: 77_777,
  expectedIncomeCents: 33_333,
  overdueExpectedIncomeCents: 1_111,
  projectedClosingBalanceCents: -12_345,
  projectionCoverage: 'overdue_only',
  projectionHorizonEnd: '2026-08-31',
}

function provider() {
  return {
    suggestCategory: vi.fn(async () => null),
    generatePeriodSummary: vi.fn(async () => ({
      text: 'Resumen',
      highlights: [],
    })),
    explainCategoryChanges: vi.fn(async () => []),
    analyzePlanning: vi.fn(async () => ({
      summary: 'Explicación de los hechos proporcionados.',
      observations: ['La cobertura es limitada.'],
      considerations: [],
    })),
  } satisfies AIInsightsProvider
}

describe('ExplainPlanning', () => {
  it('delega exactamente los hechos autoritativos sin recalcularlos', async () => {
    const ai = provider()
    const result = await new ExplainPlanning(ai).execute(snapshot)

    expect(result.summary).toContain('Explicación')
    expect(ai.analyzePlanning).toHaveBeenCalledWith({
      context: 'planning',
      facts: {
        currentBalanceCents: 100_000,
        committedCents: 22_222,
        expectedIncomeCents: 33_333,
        projectedAvailableCents: 77_777,
        projectedClosingBalanceCents: -12_345,
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: '2026-08-31',
      },
    })
  })

  it('no envía entidades, descripciones, recibos ni campos internos del snapshot', async () => {
    const ai = provider()
    await new ExplainPlanning(ai).execute(snapshot)

    const payload = JSON.stringify(ai.analyzePlanning.mock.calls[0])
    expect(payload).not.toMatch(
      /expense|incomeDescription|description|receipt|movement|spentCents|upcoming|overdueCommitted|overdueExpected/i,
    )
  })

  it('rechaza datos críticos desconocidos antes de llamar al proveedor', async () => {
    const ai = provider()

    await expect(
      new ExplainPlanning(ai).execute({
        ...snapshot,
        projectedClosingBalanceCents: null,
      }),
    ).rejects.toMatchObject({ code: 'insufficient_planning_context' })
    expect(ai.analyzePlanning).not.toHaveBeenCalled()
  })

  it('propaga el error normalizado del proveedor sin persistencia', async () => {
    const ai = provider()
    ai.analyzePlanning.mockRejectedValueOnce(
      Object.assign(new Error('No disponible'), {
        code: 'provider_unavailable',
      }),
    )

    await expect(
      new ExplainPlanning(ai).execute(snapshot),
    ).rejects.toMatchObject({
      code: 'provider_unavailable',
    })
  })
})
