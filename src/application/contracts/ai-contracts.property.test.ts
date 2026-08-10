import fc from 'fast-check'
import {
  CategorySuggestionSchema,
  parseCategoryChangeExplanations,
  parseCategorySuggestion,
  PeriodSummarySchema,
} from './index'

const uuidFrom = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

describe('propiedades de la frontera IA', () => {
  it('Feature: gasto-claro-app, Property AI-1: solo aplica categoryId exactamente permitido', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 999_999 }), {
          maxLength: 50,
        }),
        fc.option(fc.integer({ min: 0, max: 1_999_999 }), { nil: null }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (allowedValues, responseValue, confidence) => {
          const allowed = new Set(allowedValues.map(uuidFrom))
          const response =
            responseValue === null
              ? null
              : { categoryId: uuidFrom(responseValue), confidence }
          const shouldPass =
            response === null || allowed.has(response.categoryId)

          if (shouldPass)
            expect(parseCategorySuggestion(response, allowed)).toEqual(response)
          else
            expect(() =>
              parseCategorySuggestion(response, allowed),
            ).toThrowError(
              expect.objectContaining({ code: 'invalid_ai_response' }),
            )
        },
      ),
      { numRuns: 200 },
    )
  })

  it('Feature: gasto-claro-app, Property AI-2: contratos exactos rechazan límites y campos extra', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1_100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 210 }), {
          maxLength: 7,
        }),
        fc.boolean(),
        (text, highlights, extraField) => {
          const candidate = extraField
            ? { text, highlights, financialTotal: 999 }
            : { text, highlights }
          const expected =
            !extraField &&
            text.trim().length > 0 &&
            text.length <= 1_000 &&
            highlights.length <= 5 &&
            highlights.every(
              (highlight) =>
                highlight.trim().length > 0 && highlight.length <= 200,
            )
          expect(PeriodSummarySchema.safeParse(candidate).success).toBe(
            expected,
          )
        },
      ),
      { numRuns: 200 },
    )
  })

  it('Feature: gasto-claro-app, Property AI-3: explicaciones se asocian por ID, no por orden', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 999_999 }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.integer({ min: 0, max: 20 }),
        (values, rotation) => {
          const ids = values.map(uuidFrom)
          const requested = new Set(ids)
          const explanations = ids.map((categoryId) => ({
            categoryId,
            explanation: `Explicación ${categoryId}`,
          }))
          const offset = rotation % explanations.length
          const reordered = [
            ...explanations.slice(offset),
            ...explanations.slice(0, offset),
          ]
          const parsed = parseCategoryChangeExplanations(reordered, requested)
          const byId = new Map(
            parsed.map(({ categoryId, explanation }) => [
              categoryId,
              explanation,
            ]),
          )
          expect([...byId.keys()].sort()).toEqual([...requested].sort())
          for (const { categoryId, explanation } of explanations)
            expect(byId.get(categoryId)).toBe(explanation)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rechaza respuestas que intentan atravesar el contrato con valores inválidos', () => {
    const id = uuidFrom(1)
    const invalidSuggestions: unknown[] = [
      { categoryId: id, confidence: -0.1 },
      { categoryId: id, confidence: 1.1 },
      { categoryId: id, confidence: 0.5, amount: 10 },
      { categoryId: 10, confidence: 0.5 },
    ]
    const invalidSummaries: unknown[] = [
      { text: '', highlights: [] },
      { text: 'Resumen', highlights: Array(6).fill('extra') },
      { text: null, highlights: [] },
      { text: 'Resumen', highlights: [1] },
    ]
    for (const value of invalidSuggestions)
      expect(CategorySuggestionSchema.safeParse(value).success).toBe(false)
    for (const value of invalidSummaries)
      expect(PeriodSummarySchema.safeParse(value).success).toBe(false)
  })
})
