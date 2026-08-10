import {
  CategoryChangeExplanationSchema,
  CategorySuggestionSchema,
  ExplainChangesRequestSchema,
  parseCategoryChangeExplanations,
  parseCategorySuggestion,
  PeriodSummaryRequestSchema,
  PeriodSummarySchema,
  SuggestCategoryRequestSchema,
} from './index'

const categoryId = '11111111-1111-4111-8111-111111111111'
const secondCategoryId = '22222222-2222-4222-8222-222222222222'
const category = { id: categoryId, name: 'Comida' }
const suggestion = { categoryId, confidence: 0.75 }
const aggregatedData = {
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
        aggregatedData: { ...aggregatedData, totalExpenses: 1.5 },
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
        aggregatedData: { ...aggregatedData, startDate: '2026-02-30' },
      }).success,
    ).toBe(false)
  })
})
