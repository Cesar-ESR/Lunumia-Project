import {
  AIAnalysisRequestSchema,
  buildHistoricalAnalysisRequest,
  buildPlanningAnalysisRequest,
  CategoryChangeExplanationSchema,
  CategorySuggestionSchema,
  ExplainChangesRequestSchema,
  parseCategoryChangeExplanations,
  parseCategorySuggestion,
  PeriodSummaryRequestSchema,
  PeriodSummarySchema,
  SuggestCategoryRequestSchema,
} from './index'
import type { FinancialSnapshot } from '@domain/calculations'
import type { PeriodAggregatedData } from '@domain/ports'
import {
  AIAnalysisRequestSchema as EdgeAIAnalysisRequestSchema,
  parsePeriodSummaryRequest as parseEdgePeriodSummaryRequest,
} from '../../../supabase/functions/ai-insights/contracts.ts'

const categoryId = '11111111-1111-4111-8111-111111111111'
const secondCategoryId = '22222222-2222-4222-8222-222222222222'
const category = { id: categoryId, name: 'Comida' }
const suggestion = { categoryId, confidence: 0.75 }
const aggregatedData: PeriodAggregatedData = {
  totalIncome: 100_00,
  totalExpenses: 40_00,
  categoryBreakdown: [
    {
      categoryId,
      categoryName: 'Comida',
      total: 40_00,
      percentage: 100,
    },
  ],
  topExpenses: [{ description: 'Mercado', amount: 40_00 }],
  periodType: 'monthly' as const,
  startDate: '2026-08-01',
  endDate: '2026-08-31',
}
const historicalRequest = buildHistoricalAnalysisRequest(aggregatedData)

const planningSnapshot: FinancialSnapshot = {
  currentBalanceCents: -10_00,
  spentCents: 40_00,
  committedCents: 25_00,
  upcomingCommittedCents: 20_00,
  overdueCommittedCents: 5_00,
  projectedAvailableCents: -35_00,
  expectedIncomeCents: 30_00,
  overdueExpectedIncomeCents: 0,
  projectedClosingBalanceCents: -5_00,
  projectionHorizonEnd: '2026-08-31',
  projectionCoverage: 'full_period',
}

describe('contratos de IA', () => {
  it('1. acepta una sugerencia válida', () => {
    expect(CategorySuggestionSchema.parse(suggestion)).toEqual(suggestion)
  })

  it('2. acepta ausencia de sugerencia', () => {
    expect(CategorySuggestionSchema.parse(null)).toBeNull()
  })

  it('3. rechaza UUID inválido', () => {
    expect(() =>
      CategorySuggestionSchema.parse({ ...suggestion, categoryId: 'invalid' }),
    ).toThrow()
  })

  it.each([-0.01, 1.01])(
    '4. rechaza confidence fuera de rango: %s',
    (confidence) => {
      expect(() =>
        CategorySuggestionSchema.parse({ ...suggestion, confidence }),
      ).toThrow()
    },
  )

  it('5. rechaza campos adicionales', () => {
    expect(() =>
      CategorySuggestionSchema.parse({ ...suggestion, amount: 10 }),
    ).toThrow()
  })

  it('6. rechaza una categoría no enviada', () => {
    expect(() => parseCategorySuggestion(suggestion, new Set())).toThrowError(
      expect.objectContaining({ code: 'invalid_ai_response' }),
    )
  })

  it('7. valida texto y highlights', () => {
    expect(
      PeriodSummarySchema.parse({
        text: 'Resumen válido',
        highlights: ['Uno'],
      }),
    ).toEqual({ text: 'Resumen válido', highlights: ['Uno'] })
  })

  it('8. rechaza más de cinco highlights', () => {
    expect(() =>
      PeriodSummarySchema.parse({
        text: 'Resumen',
        highlights: Array(6).fill('Uno'),
      }),
    ).toThrow()
  })

  it('9. rechaza texto mayor de 1000 caracteres', () => {
    expect(() =>
      PeriodSummarySchema.parse({ text: 'x'.repeat(1001), highlights: [] }),
    ).toThrow()
  })

  it('10. valida explicaciones para categorías conocidas', () => {
    const value = [{ categoryId, explanation: 'Cambio explicado.' }]
    expect(
      parseCategoryChangeExplanations(value, new Set([categoryId])),
    ).toEqual(value)
  })

  it('11. rechaza IDs de explicación duplicados', () => {
    expect(() =>
      CategoryChangeExplanationSchema.parse([
        { categoryId, explanation: 'Uno' },
        { categoryId, explanation: 'Dos' },
      ]),
    ).toThrow()
  })

  it('12. rechaza explicaciones mayores de 500 caracteres', () => {
    expect(() =>
      CategoryChangeExplanationSchema.parse([
        { categoryId, explanation: 'x'.repeat(501) },
      ]),
    ).toThrow()
  })

  it('13. acepta descripciones de 2000 caracteres', () => {
    expect(
      SuggestCategoryRequestSchema.safeParse({
        description: 'x'.repeat(2000),
        categories: [category],
      }).success,
    ).toBe(true)
  })

  it('14. rechaza descripciones mayores de 2000 caracteres', () => {
    expect(
      SuggestCategoryRequestSchema.safeParse({
        description: 'x'.repeat(2001),
        categories: [category],
      }).success,
    ).toBe(false)
  })

  it('15. acepta hasta 50 categorías', () => {
    const categories = Array.from({ length: 50 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Categoría ${index}`,
    }))
    expect(
      SuggestCategoryRequestSchema.safeParse({
        description: 'Compra',
        categories,
      }).success,
    ).toBe(true)
  })

  it('16. rechaza la categoría número 51', () => {
    const categories = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Categoría ${index}`,
    }))
    expect(
      SuggestCategoryRequestSchema.safeParse({
        description: 'Compra',
        categories,
      }).success,
    ).toBe(false)
  })

  it('17. rechaza IDs de solicitud duplicados', () => {
    expect(
      SuggestCategoryRequestSchema.safeParse({
        description: 'Compra',
        categories: [category, category],
      }).success,
    ).toBe(false)
  })

  it('18. rechaza importes decimales', () => {
    expect(
      PeriodSummaryRequestSchema.safeParse({
        ...historicalRequest,
        facts: { ...historicalRequest.facts, expenseCents: 1.5 },
      }).success,
    ).toBe(false)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    '19. rechaza números no finitos: %s',
    (changePercentage) => {
      expect(
        ExplainChangesRequestSchema.safeParse({
          changes: [
            {
              categoryId: secondCategoryId,
              categoryName: 'Servicios',
              currentAmount: 100,
              previousAmount: 50,
              changePercentage,
              absoluteChange: 50,
            },
          ],
        }).success,
      ).toBe(false)
    },
  )

  it('20. rechaza DateOnly inválido', () => {
    expect(
      PeriodSummaryRequestSchema.safeParse({
        ...historicalRequest,
        facts: { ...historicalRequest.facts, startDate: '2026-02-30' },
      }).success,
    ).toBe(false)
  })

  it('21. convierte datos deterministas a hechos históricos explícitos', () => {
    const source = structuredClone(aggregatedData)
    const request = buildHistoricalAnalysisRequest(aggregatedData)

    expect(request).toEqual({
      context: 'historical',
      facts: {
        receivedIncomeCents: 100_00,
        expenseCents: 40_00,
        categoryBreakdown: [
          {
            categoryId,
            categoryName: 'Comida',
            totalCents: 40_00,
            percentage: 100,
          },
        ],
        topExpenses: [{ description: 'Mercado', amountCents: 40_00 }],
        periodType: 'monthly',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      },
    })
    expect(JSON.stringify(request)).not.toMatch(
      /totalIncome|expected|cancelled|status/,
    )
    expect(aggregatedData).toEqual(source)
  })

  it('22. planificación expone solo agregados precalculados y conserva signo', () => {
    const source = structuredClone(planningSnapshot)
    const request = buildPlanningAnalysisRequest(planningSnapshot)

    expect(request).toEqual({
      context: 'planning',
      facts: {
        currentBalanceCents: -10_00,
        committedCents: 25_00,
        expectedIncomeCents: 30_00,
        projectedAvailableCents: -35_00,
        projectedClosingBalanceCents: -5_00,
        projectionCoverage: 'full_period',
        projectionHorizonEnd: '2026-08-31',
      },
    })
    expect(JSON.stringify(request)).not.toMatch(
      /incomes|expenses|occurrences|spentCents|upcoming|overdue/,
    )
    expect(planningSnapshot).toEqual(source)
  })

  it('23. planificación conserva null cuando no hay saldo base', () => {
    const request = buildPlanningAnalysisRequest({
      ...planningSnapshot,
      currentBalanceCents: null,
      projectedAvailableCents: null,
      projectedClosingBalanceCents: null,
      projectionHorizonEnd: null,
      projectionCoverage: 'overdue_only',
    })

    expect(request.facts).toMatchObject({
      currentBalanceCents: null,
      projectedAvailableCents: null,
      projectedClosingBalanceCents: null,
      projectionHorizonEnd: null,
      projectionCoverage: 'overdue_only',
    })
  })

  it('24. discrimina contexto y rechaza una etiqueta desconocida', () => {
    expect(
      AIAnalysisRequestSchema.safeParse({
        ...historicalRequest,
        context: 'forecast',
      }).success,
    ).toBe(false)
  })

  it('25. rechaza agregados de planificación negativos', () => {
    const request = buildPlanningAnalysisRequest(planningSnapshot)
    expect(
      AIAnalysisRequestSchema.safeParse({
        ...request,
        facts: { ...request.facts, committedCents: -1 },
      }).success,
    ).toBe(false)
  })

  it('26. cliente y Edge aceptan los mismos contratos Domain 2.0', () => {
    const planningRequest = buildPlanningAnalysisRequest(planningSnapshot)

    expect(parseEdgePeriodSummaryRequest(historicalRequest)).toEqual(
      historicalRequest,
    )
    expect(EdgeAIAnalysisRequestSchema.parse(planningRequest)).toEqual(
      planningRequest,
    )
  })
})
