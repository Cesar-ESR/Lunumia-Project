import { AIInsightsFunctionError } from '../errors.ts'
import { MockAIProvider, type MockAIProviderFailure } from './MockAIProvider.ts'

const firstCategoryId = '11111111-1111-4111-8111-111111111111'
const secondCategoryId = '22222222-2222-4222-8222-222222222222'
const suggestionInput = {
  description: 'Compra privada de comida',
  categories: [{ id: firstCategoryId, name: 'Comida' }],
}
const summaryInput = {
  context: 'historical' as const,
  facts: {
    receivedIncomeCents: 10_000,
    expenseCents: 4_000,
    categoryBreakdown: [
      {
        categoryId: firstCategoryId,
        categoryName: 'Comida',
        totalCents: 4_000,
        percentage: 100,
      },
    ],
    topExpenses: [{ description: 'Dato privado', amountCents: 4_000 }],
    periodType: 'monthly' as const,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  },
}
const changesInput = {
  changes: [
    {
      categoryId: firstCategoryId,
      categoryName: 'Comida',
      currentAmount: 4_000,
      previousAmount: 2_000,
      changePercentage: 100,
      absoluteChange: 2_000,
    },
    {
      categoryId: secondCategoryId,
      categoryName: 'Servicios',
      currentAmount: 1_000,
      previousAmount: 2_000,
      changePercentage: -50,
      absoluteChange: -1_000,
    },
  ],
}

describe('MockAIProvider configurable', () => {
  it('es determinista, permite extremos de confianza y null', async () => {
    for (const categorySuggestion of [
      null,
      { categoryId: firstCategoryId, confidence: 0 },
      { categoryId: firstCategoryId, confidence: 1 },
      { categoryId: secondCategoryId, confidence: 0.5 },
      { categoryId: 'unknown', confidence: 1.1 },
    ]) {
      const provider = new MockAIProvider({ categorySuggestion })
      await expect(
        provider.suggestCategory(suggestionInput, new AbortController().signal),
      ).resolves.toEqual(categorySuggestion)
    }
  })

  it('configura resumen y explicaciones vacías, reordenadas, duplicadas o incompletas', async () => {
    const periodSummary = { text: 'Resumen fijo', highlights: [] }
    const categoryExplanations = [
      { categoryId: secondCategoryId, explanation: 'Segundo' },
      { categoryId: firstCategoryId, explanation: 'Primero' },
      { categoryId: firstCategoryId, explanation: 'Duplicado' },
    ]
    const provider = new MockAIProvider({ periodSummary, categoryExplanations })
    await expect(
      provider.generatePeriodSummary(
        summaryInput,
        new AbortController().signal,
      ),
    ).resolves.toEqual(periodSummary)
    await expect(
      provider.explainCategoryChanges(
        changesInput,
        new AbortController().signal,
      ),
    ).resolves.toEqual(categoryExplanations)

    const incomplete = new MockAIProvider({ categoryExplanations: [] })
    await expect(
      incomplete.explainCategoryChanges(
        changesInput,
        new AbortController().signal,
      ),
    ).resolves.toEqual([])
  })

  it.each<MockAIProviderFailure>([
    'network_error',
    'rate_limited',
    'provider_timeout',
    'provider_unavailable',
    'unauthenticated',
    'unknown',
  ])('simula el fallo %s sin red', async (failWith) => {
    const provider = new MockAIProvider({ failWith })
    const result = provider.suggestCategory(
      suggestionInput,
      new AbortController().signal,
    )
    if (failWith === 'network_error')
      await expect(result).rejects.toBeInstanceOf(TypeError)
    else await expect(result).rejects.toBeInstanceOf(AIInsightsFunctionError)
  })

  it('usa delay controlado, cancela por abort y no deja timers', async () => {
    vi.useFakeTimers()
    const provider = new MockAIProvider({ delayMs: 500 })
    const controller = new AbortController()
    const pending = provider.suggestCategory(suggestionInput, controller.signal)
    expect(vi.getTimerCount()).toBe(1)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'provider_timeout' })
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('registra solo método, orden y estructura mínima no sensible', async () => {
    const provider = new MockAIProvider()
    const signal = new AbortController().signal
    await provider.suggestCategory(suggestionInput, signal)
    await provider.generatePeriodSummary(summaryInput, signal)
    await provider.explainCategoryChanges(changesInput, signal)

    expect(provider.calls.map(({ method }) => method)).toEqual([
      'suggestCategory',
      'generatePeriodSummary',
      'explainCategoryChanges',
    ])
    expect(provider.callCount('suggestCategory')).toBe(1)
    expect(provider.calls[0]?.payload).toEqual({
      descriptionLength: suggestionInput.description.length,
      categoryCount: 1,
    })
    expect(provider.calls[1]?.payload).toMatchObject({
      context: 'historical',
      periodType: 'monthly',
    })
    const audit = JSON.stringify(provider.calls)
    expect(audit).not.toContain(suggestionInput.description)
    expect(audit).not.toContain('Dato privado')
    expect(audit).not.toMatch(/token|jwt|secret|key/i)
  })
})
