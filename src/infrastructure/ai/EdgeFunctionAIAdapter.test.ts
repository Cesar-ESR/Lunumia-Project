import type { PeriodAggregatedData } from '@domain/ports'
import {
  AIInsightsError,
  EdgeFunctionAIAdapter,
  type AIFunctionsClient,
} from './index'

const categoryId = '11111111-1111-4111-8111-111111111111'
const secondCategoryId = '22222222-2222-4222-8222-222222222222'
const category = { id: categoryId, name: 'Comida' }
const aggregatedData: PeriodAggregatedData = {
  totalIncome: 700_000,
  totalExpenses: 21_300,
  categoryBreakdown: [
    {
      categoryId,
      categoryName: 'Comida',
      total: 14_000,
      percentage: 65.73,
    },
    {
      categoryId: secondCategoryId,
      categoryName: 'Transporte',
      total: 7_300,
      percentage: 34.27,
    },
  ],
  topExpenses: [
    { description: 'Hamburguesa', amount: 12_000 },
    { description: 'Uber al trabajo', amount: 5_000 },
    { description: 'Pasaje', amount: 2_300 },
    { description: 'Agua', amount: 2_000 },
  ],
  periodType: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
}
const change = {
  categoryId,
  categoryName: 'Comida',
  currentAmount: 4_000,
  previousAmount: 2_000,
  changePercentage: 100,
  absoluteChange: 2_000,
}
const planningInput = {
  context: 'planning' as const,
  facts: {
    currentBalanceCents: 100_000,
    committedCents: 22_222,
    expectedIncomeCents: 33_333,
    projectedAvailableCents: 77_777,
    projectedClosingBalanceCents: -12_345,
    projectionCoverage: 'overdue_only' as const,
    projectionHorizonEnd: '2026-08-31' as const,
  },
}

function createClient(data: unknown = null, error: unknown = null) {
  const invoke = vi.fn(async () => ({ data, error }))
  return {
    client: { functions: { invoke } } satisfies AIFunctionsClient,
    invoke,
  }
}

describe('EdgeFunctionAIAdapter', () => {
  it('21. invoca suggest-category correctamente', async () => {
    const { client, invoke } = createClient({ categoryId, confidence: 0.8 })
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('Comida', [category]),
    ).resolves.toEqual({ categoryId, confidence: 0.8 })
    expect(invoke).toHaveBeenCalledWith('ai-insights/suggest-category', {
      method: 'POST',
      body: { description: 'Comida', categories: [category] },
    })
  })

  it('22. invoca period-summary correctamente', async () => {
    const response = { text: 'Resumen', highlights: [] }
    const { client, invoke } = createClient(response)
    await expect(
      new EdgeFunctionAIAdapter(client).generatePeriodSummary(aggregatedData),
    ).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledWith('ai-insights/period-summary', {
      method: 'POST',
      body: {
        context: 'historical',
        facts: {
          receivedIncomeCents: 700_000,
          expenseCents: 21_300,
          categoryBreakdown: [
            {
              categoryId,
              categoryName: 'Comida',
              totalCents: 14_000,
              percentage: 65.73,
            },
            {
              categoryId: secondCategoryId,
              categoryName: 'Transporte',
              totalCents: 7_300,
              percentage: 34.27,
            },
          ],
          topExpenses: [
            { description: 'Hamburguesa', amountCents: 12_000 },
            { description: 'Uber al trabajo', amountCents: 5_000 },
            { description: 'Pasaje', amountCents: 2_300 },
            { description: 'Agua', amountCents: 2_000 },
          ],
          periodType: 'monthly',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        },
      },
    })
    const serializedRequest = JSON.stringify(invoke.mock.calls[0])
    expect(serializedRequest).toMatch(/700000|21300|14000|7300/)
    expect(serializedRequest).not.toMatch(
      /aggregatedData|totalIncome|expected|cancelled/,
    )
    expect(aggregatedData.totalIncome).toBe(700_000)
  })

  it('23. invoca explain-changes correctamente', async () => {
    const response = [{ categoryId, explanation: 'Cambio explicado.' }]
    const { client, invoke } = createClient(response)
    await expect(
      new EdgeFunctionAIAdapter(client).explainCategoryChanges([change]),
    ).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledWith('ai-insights/explain-changes', {
      method: 'POST',
      body: { changes: [change] },
    })
  })

  it('24. no envía userId', async () => {
    const { client, invoke } = createClient(null)
    await new EdgeFunctionAIAdapter(client).suggestCategory(
      'Sin coincidencia',
      [category],
    )
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain('userId')
  })

  it('25. no envía service_role', async () => {
    const { client, invoke } = createClient(null)
    await new EdgeFunctionAIAdapter(client).suggestCategory(
      'Sin coincidencia',
      [category],
    )
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain('service_role')
  })

  it('26. valida la respuesta con Zod y los IDs conocidos', async () => {
    const { client } = createClient({
      categoryId: '22222222-2222-4222-8222-222222222222',
      confidence: 0.8,
    })
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('Comida', [category]),
    ).rejects.toMatchObject({ code: 'invalid_ai_response' })
  })

  it('27. traduce 401', async () => {
    const { client } = createClient(null, {
      context: new Response('{}', { status: 401 }),
    })
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('Comida', [category]),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('28. traduce 429', async () => {
    const { client } = createClient(null, { code: 'rate_limited' })
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('Comida', [category]),
    ).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('29. traduce timeout', async () => {
    const invoke = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    const client = { functions: { invoke } } satisfies AIFunctionsClient
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('Comida', [category]),
    ).rejects.toMatchObject({ code: 'provider_timeout' })
  })

  it('30. traduce error de red', async () => {
    const invoke = vi.fn(async () => {
      throw new TypeError('offline')
    })
    const client = { functions: { invoke } } satisfies AIFunctionsClient
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('Comida', [category]),
    ).rejects.toMatchObject({ code: 'network_error' })
  })

  it('31. no imprime payloads sensibles', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = createClient(null, new Error('provider detail'))
    await expect(
      new EdgeFunctionAIAdapter(client).suggestCategory('dato privado', [
        category,
      ]),
    ).rejects.toBeInstanceOf(AIInsightsError)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    log.mockRestore()
    error.mockRestore()
  })

  it('32. usa exclusivamente el cliente Supabase inyectado', async () => {
    const { client, invoke } = createClient(null)
    const adapter = new EdgeFunctionAIAdapter(client)
    await adapter.suggestCategory('Sin coincidencia', [category])
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('33. envía planificación agregada exacta por la ruta dedicada', async () => {
    const response = {
      summary: 'Explicación',
      observations: ['Cobertura limitada.'],
      considerations: [],
    }
    const { client, invoke } = createClient(response)

    await expect(
      new EdgeFunctionAIAdapter(client).analyzePlanning(planningInput),
    ).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledWith('ai-insights/planning-analysis', {
      method: 'POST',
      body: planningInput,
    })
    expect(JSON.stringify(invoke.mock.calls[0])).not.toMatch(
      /description|receipt|expense|movement|merchant|notes|service_role/i,
    )
  })

  it('34. conserva negativos, cobertura y horizonte sin derivar importes', async () => {
    const { client, invoke } = createClient({
      summary: 'Explicación',
      observations: [],
      considerations: [],
    })

    await new EdgeFunctionAIAdapter(client).analyzePlanning(planningInput)

    expect(invoke).toHaveBeenCalledWith('ai-insights/planning-analysis', {
      method: 'POST',
      body: planningInput,
    })
  })

  it('35. rechaza respuesta de planificación con autoridad financiera', async () => {
    const { client } = createClient({
      summary: 'Explicación',
      observations: [],
      considerations: [],
      safeToSpendCents: 50_000,
    })

    await expect(
      new EdgeFunctionAIAdapter(client).analyzePlanning(planningInput),
    ).rejects.toMatchObject({ code: 'invalid_ai_response' })
  })

  it('36. rechaza contexto insuficiente localmente sin invocar Edge', async () => {
    const { client, invoke } = createClient()

    await expect(
      new EdgeFunctionAIAdapter(client).analyzePlanning({
        ...planningInput,
        facts: { ...planningInput.facts, currentBalanceCents: null },
      }),
    ).rejects.toMatchObject({ code: 'insufficient_planning_context' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('37. traduce insufficient_planning_context de Edge', async () => {
    const { client } = createClient(null, {
      context: Response.json(
        { code: 'insufficient_planning_context' },
        { status: 422 },
      ),
    })

    await expect(
      new EdgeFunctionAIAdapter(client).analyzePlanning(planningInput),
    ).rejects.toMatchObject({ code: 'insufficient_planning_context' })
  })
})
