import {
  LegacyPeriodSummaryRequestSchema,
  parseAIAnalysisRequest,
  parsePeriodSummaryRequest,
  parsePlanningAnalysisRequest,
  PlanningAnalysisResponseSchema,
} from './contracts.ts'

const categoryId = '11111111-1111-4111-8111-111111111111'
const historicalRequest = {
  context: 'historical' as const,
  facts: {
    receivedIncomeCents: 10_000,
    expenseCents: 4_000,
    categoryBreakdown: [
      {
        categoryId,
        categoryName: 'Comida',
        totalCents: 4_000,
        percentage: 100,
      },
    ],
    topExpenses: [{ description: 'Mercado', amountCents: 4_000 }],
    periodType: 'monthly' as const,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  },
}
const planningRequest = {
  context: 'planning' as const,
  facts: {
    currentBalanceCents: null,
    committedCents: 25_00,
    expectedIncomeCents: 30_00,
    projectedAvailableCents: -35_00,
    projectedClosingBalanceCents: -5_00,
    projectionCoverage: 'overdue_only' as const,
    projectionHorizonEnd: null,
  },
}
const legacyHistoricalRequest = {
  aggregatedData: {
    totalIncome: 10_000,
    totalExpenses: 4_000,
    categoryBreakdown: [
      {
        categoryId,
        categoryName: 'Comida',
        total: 4_000,
        percentage: 100,
      },
    ],
    topExpenses: [{ description: 'Mercado', amount: 4_000 }],
    periodType: 'monthly' as const,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  },
}

describe('contrato Edge de análisis Domain 2.0', () => {
  it('acepta hechos históricos canónicos', () => {
    expect(parsePeriodSummaryRequest(historicalRequest)).toEqual(
      historicalRequest,
    )
  })

  it('normaliza el contrato histórico de producción a un único modelo canónico', () => {
    expect(
      LegacyPeriodSummaryRequestSchema.parse(legacyHistoricalRequest),
    ).toEqual(legacyHistoricalRequest)
    expect(parsePeriodSummaryRequest(legacyHistoricalRequest)).toEqual(
      historicalRequest,
    )
  })

  it.each([
    { ...legacyHistoricalRequest, context: 'historical' },
    {
      aggregatedData: {
        ...legacyHistoricalRequest.aggregatedData,
        extra: true,
      },
    },
  ])('rechaza un envelope legacy malformado', (value) => {
    expect(() => parsePeriodSummaryRequest(value)).toThrowError(
      expect.objectContaining({ code: 'invalid_request' }),
    )
  })

  it('rechaza un envelope v2 malformado sin caer al parser legacy', () => {
    expect(() =>
      parsePeriodSummaryRequest({
        ...historicalRequest,
        facts: { ...historicalRequest.facts, receivedIncomeCents: -1 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_request' }))
  })

  it('acepta planificación agregada con null y proyecciones negativas', () => {
    expect(parseAIAnalysisRequest(planningRequest)).toEqual(planningRequest)
  })

  it('rechaza un discriminador desconocido', () => {
    expect(() =>
      parseAIAnalysisRequest({ ...planningRequest, context: 'forecast' }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_request' }))
  })

  it('rechaza cents decimales', () => {
    expect(() =>
      parseAIAnalysisRequest({
        ...planningRequest,
        facts: { ...planningRequest.facts, expectedIncomeCents: 1.5 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_request' }))
  })

  it('rechaza agregados no negativos con signo incorrecto', () => {
    expect(() =>
      parseAIAnalysisRequest({
        ...planningRequest,
        facts: { ...planningRequest.facts, committedCents: -1 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_request' }))
  })

  it('valida planificación completa y conserva cada hecho exactamente', () => {
    const complete = {
      ...planningRequest,
      facts: {
        ...planningRequest.facts,
        currentBalanceCents: 100_000,
        projectedAvailableCents: 77_777,
        projectedClosingBalanceCents: -12_345,
        projectionHorizonEnd: '2026-08-31',
      },
    }

    expect(parsePlanningAnalysisRequest(complete)).toEqual(complete)
  })

  it('rechaza contexto crítico insuficiente sin convertir null en cero', () => {
    expect(() => parsePlanningAnalysisRequest(planningRequest)).toThrowError(
      expect.objectContaining({ code: 'insufficient_planning_context' }),
    )
    expect(planningRequest.facts.currentBalanceCents).toBeNull()
  })

  it.each([
    { summary: 'Resumen', observations: [], considerations: [] },
    { summary: 'Resumen', observations: [], considerations: [], riskScore: 1 },
    {
      summary: 'Resumen',
      observations: Array(5).fill('Dato'),
      considerations: [],
    },
  ])('valida estrictamente la respuesta explicativa', (value) => {
    expect(PlanningAnalysisResponseSchema.safeParse(value).success).toBe(
      !('riskScore' in value) && value.observations.length <= 4,
    )
  })
})
