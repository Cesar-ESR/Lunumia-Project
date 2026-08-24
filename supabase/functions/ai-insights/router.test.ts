import type { AIProvider } from './providers/AIProvider.ts'
import { readAllowedOrigins } from '../_shared/environment.ts'
import { AIInsightsFunctionError } from './errors.ts'
import { MockAIProvider } from './providers/MockAIProvider.ts'
import { createAIProvider } from './providers/ProviderFactory.ts'
import { GroqAIProvider } from './providers/GroqAIProvider.ts'
import { InMemoryRateLimiter } from './rate-limit/InMemoryRateLimiter.ts'
import {
  RateLimitStorageError,
  type DistributedRateLimiter,
} from '../_shared/distributed-rate-limiter.ts'
import { createAIInsightsHandler } from './router.ts'

const categoryId = '11111111-1111-4111-8111-111111111111'
const token = 'secret-jwt-that-must-not-be-logged'
const capacitorOrigin = 'https://localhost'
const webOrigin = 'http://localhost:5173'
const suggestBody = {
  description: 'Compra de comida',
  categories: [{ id: categoryId, name: 'Comida' }],
}
const summaryBody = {
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
    ],
    topExpenses: [{ description: 'Hamburguesa', amountCents: 12_000 }],
    periodType: 'monthly',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  },
}
const explainBody = {
  changes: [
    {
      categoryId,
      categoryName: 'Comida',
      currentAmount: 4_000,
      previousAmount: 2_000,
      changePercentage: 100,
      absoluteChange: 2_000,
    },
  ],
}
const planningBody = {
  context: 'planning' as const,
  facts: {
    currentBalanceCents: 100_000,
    committedCents: 22_222,
    expectedIncomeCents: 33_333,
    projectedAvailableCents: 77_777,
    projectedClosingBalanceCents: -12_345,
    projectionCoverage: 'overdue_only' as const,
    projectionHorizonEnd: '2026-08-31',
  },
}

function createProvider(): AIProvider & {
  suggestCategory: ReturnType<typeof vi.fn>
  generatePeriodSummary: ReturnType<typeof vi.fn>
  explainCategoryChanges: ReturnType<typeof vi.fn>
  analyzePlanning: ReturnType<typeof vi.fn>
} {
  return {
    suggestCategory: vi.fn(async () => ({ categoryId, confidence: 0.8 })),
    generatePeriodSummary: vi.fn(async () => ({
      text: 'Resumen',
      highlights: [],
    })),
    explainCategoryChanges: vi.fn(async () => [
      { categoryId, explanation: 'Cambio explicado.' },
    ]),
    analyzePlanning: vi.fn(async () => ({
      summary: 'Explicación de la proyección.',
      observations: [],
      considerations: [],
    })),
  }
}

function createHandler(options?: {
  provider?: AIProvider
  verifyToken?: (value: string) => Promise<{ userId: string } | null>
  timeoutMs?: number
  rateLimiter?: InMemoryRateLimiter | DistributedRateLimiter
  now?: () => number
}) {
  const provider = options?.provider ?? createProvider()
  const createProviderDependency = vi.fn(() => provider)
  const now = options?.now ?? (() => 1_000)
  const configuredLimiter = options?.rateLimiter ?? new InMemoryRateLimiter()
  const rateLimiter: DistributedRateLimiter =
    configuredLimiter instanceof InMemoryRateLimiter
      ? {
          consume: async () => configuredLimiter.consume(categoryId, now()),
        }
      : configuredLimiter
  return {
    provider,
    createProviderDependency,
    rateLimiter: configuredLimiter,
    handler: createAIInsightsHandler({
      allowedOrigins: readAllowedOrigins([]),
      timeoutMs: options?.timeoutMs ?? 1_000,
      rateLimiter,
      now,
      verifyToken:
        options?.verifyToken ?? (async () => ({ userId: categoryId })),
      createProvider: createProviderDependency,
    }),
  }
}

function request(
  route: string,
  body: unknown,
  options?: { method?: string; authorization?: string | null; origin?: string },
): Request {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Origin: options?.origin ?? webOrigin,
  })
  const method = options?.method ?? 'POST'
  if (method === 'OPTIONS') {
    headers.set('Access-Control-Request-Method', 'POST')
    headers.set(
      'Access-Control-Request-Headers',
      'authorization, apikey, content-type, x-client-info',
    )
  } else if (options?.authorization !== null) {
    headers.set('Authorization', options?.authorization ?? `Bearer ${token}`)
  }
  return new Request(`http://localhost/functions/v1/ai-insights/${route}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

function expectCors(response: Response, origin: string): void {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  expect(response.headers.get('Vary')).toBe('Origin')
}

describe('ai-insights router', () => {
  it('33. OPTIONS permite el origen Web existente', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request('suggest-category', null, { method: 'OPTIONS' }),
    )
    expect(response.status).toBe(204)
    expectCors(response, webOrigin)
  })

  it('33.a OPTIONS permite https://localhost de Capacitor Android', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request('suggest-category', null, {
        method: 'OPTIONS',
        origin: capacitorOrigin,
      }),
    )
    expect(response.status).toBe(204)
    expectCors(response, capacitorOrigin)
  })

  it('33.b OPTIONS declara headers y métodos requeridos por supabase-js', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request('suggest-category', null, {
        method: 'OPTIONS',
        origin: capacitorOrigin,
      }),
    )
    const allowedHeaders =
      response.headers
        .get('Access-Control-Allow-Headers')
        ?.split(',')
        .map((header) => header.trim().toLowerCase()) ?? []
    expect(allowedHeaders).toEqual(
      expect.arrayContaining([
        'authorization',
        'apikey',
        'content-type',
        'x-client-info',
      ]),
    )
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'POST, OPTIONS',
    )
  })

  it('33.c OPTIONS no autentica, crea provider ni consume rate limit', async () => {
    const verifyToken = vi.fn(async () => ({ userId: categoryId }))
    const rateLimiter = new InMemoryRateLimiter()
    const consume = vi.spyOn(rateLimiter, 'consume')
    const { handler, createProviderDependency } = createHandler({
      verifyToken,
      rateLimiter,
    })
    const response = await handler(
      request('suggest-category', null, {
        method: 'OPTIONS',
        origin: capacitorOrigin,
      }),
    )
    expect(response.status).toBe(204)
    expect(verifyToken).not.toHaveBeenCalled()
    expect(createProviderDependency).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
  })

  it('34. GET se rechaza', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request('suggest-category', null, { method: 'GET' }),
    )
    expect(response.status).toBe(405)
    expectCors(response, webOrigin)
    await expect(response.json()).resolves.toMatchObject({
      code: 'method_not_allowed',
    })
  })

  it('35. sin token devuelve 401', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request('suggest-category', suggestBody, {
        authorization: null,
        origin: capacitorOrigin,
      }),
    )
    expect(response.status).toBe(401)
    expectCors(response, capacitorOrigin)
  })

  it('36. token inválido devuelve 401', async () => {
    const { handler } = createHandler({ verifyToken: async () => null })
    const response = await handler(request('suggest-category', suggestBody))
    expect(response.status).toBe(401)
    expectCors(response, webOrigin)
    await expect(response.json()).resolves.toMatchObject({
      code: 'unauthenticated',
    })
  })

  it('37. usuario válido puede continuar', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request('suggest-category', suggestBody, { origin: capacitorOrigin }),
    )
    expect(response.status).toBe(200)
    expectCors(response, capacitorOrigin)
  })

  it('38. endpoint desconocido devuelve 404', async () => {
    const { handler } = createHandler()
    const response = await handler(request('other', suggestBody))
    expect(response.status).toBe(404)
    expectCors(response, webOrigin)
  })

  it('39. payload inválido devuelve 400', async () => {
    const { handler } = createHandler()
    const response = await handler(
      request(
        'suggest-category',
        { userId: categoryId },
        {
          origin: capacitorOrigin,
        },
      ),
    )
    expect(response.status).toBe(400)
    expectCors(response, capacitorOrigin)
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_request',
    })
  })

  it('39.c period-summary rechaza contexto de planificación no expuesto', async () => {
    const { handler, provider } = createHandler()
    const response = await handler(
      request('period-summary', {
        context: 'planning',
        facts: {
          currentBalanceCents: -1_000,
          committedCents: 2_000,
          expectedIncomeCents: 3_000,
          projectedAvailableCents: -3_000,
          projectedClosingBalanceCents: 0,
          projectionCoverage: 'full_period',
          projectionHorizonEnd: '2026-08-31',
        },
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_request',
    })
    expect(provider.generatePeriodSummary).not.toHaveBeenCalled()
  })

  it('39.a rate limit devuelve 429 con CORS', async () => {
    const { handler } = createHandler({
      rateLimiter: new InMemoryRateLimiter(0),
    })
    const response = await handler(
      request('suggest-category', suggestBody, { origin: capacitorOrigin }),
    )
    expect(response.status).toBe(429)
    expectCors(response, capacitorOrigin)
    expect(response.headers.get('Retry-After')).toBe('60')
  })

  it('39.b fallo inesperado devuelve 500 con CORS', async () => {
    const { handler } = createHandler({
      verifyToken: async () => {
        throw new Error('unexpected')
      },
    })
    const response = await handler(
      request('suggest-category', suggestBody, { origin: capacitorOrigin }),
    )
    expect(response.status).toBe(500)
    expectCors(response, capacitorOrigin)
    await expect(response.json()).resolves.toMatchObject({ code: 'unknown' })
  })

  it('39.c falla cerrado si el almacén distribuido no está disponible', async () => {
    const createProviderDependency = vi.fn(createProvider)
    const { handler } = createHandler({
      rateLimiter: {
        consume: async () => {
          throw new RateLimitStorageError()
        },
      },
      provider: createProviderDependency(),
    })
    const response = await handler(request('suggest-category', suggestBody))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'rate_limit_unavailable',
    })
  })

  it('40. suggest-category llama únicamente al método correspondiente', async () => {
    const { handler, provider } = createHandler()
    await handler(request('suggest-category', suggestBody))
    expect(provider.suggestCategory).toHaveBeenCalledOnce()
    expect(provider.generatePeriodSummary).not.toHaveBeenCalled()
    expect(provider.explainCategoryChanges).not.toHaveBeenCalled()
  })

  it('41. period-summary llama únicamente al método correspondiente', async () => {
    const { handler, provider } = createHandler()
    await handler(request('period-summary', summaryBody))
    expect(provider.generatePeriodSummary).toHaveBeenCalledOnce()
    expect(provider.suggestCategory).not.toHaveBeenCalled()
    expect(provider.explainCategoryChanges).not.toHaveBeenCalled()
  })

  it('41.a acepta AmountCents y entrega a Groq solo importes display', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ text: 'Resumen', highlights: [] }),
            },
          },
        ],
      }),
    )
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })
    const { handler } = createHandler({ provider })

    const response = await handler(request('period-summary', summaryBody))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      text: 'Resumen',
      highlights: [],
    })
    const [, init] = fetcher.mock.calls[0]!
    const groqRequest = JSON.parse(String(init?.body))
    const userMessage = groqRequest.messages[1].content as string
    expect(userMessage).toContain('$7,000.00')
    expect(userMessage).toContain('$213.00')
    expect(userMessage).not.toMatch(/700000|21300/)
    expect(groqRequest.response_format.json_schema.strict).toBe(true)
  })

  it('41.b planning-analysis valida y llama únicamente al método dedicado', async () => {
    const { handler, provider } = createHandler()

    const response = await handler(request('planning-analysis', planningBody))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      summary: 'Explicación de la proyección.',
      observations: [],
      considerations: [],
    })
    expect(provider.analyzePlanning).toHaveBeenCalledWith(
      planningBody,
      expect.any(AbortSignal),
    )
    expect(provider.suggestCategory).not.toHaveBeenCalled()
    expect(provider.generatePeriodSummary).not.toHaveBeenCalled()
    expect(provider.explainCategoryChanges).not.toHaveBeenCalled()
  })

  it('41.c planning-analysis rechaza payload inválido con 400', async () => {
    const { handler, provider } = createHandler()
    const response = await handler(
      request('planning-analysis', {
        ...planningBody,
        facts: { ...planningBody.facts, committedCents: 1.5 },
      }),
    )

    expect(response.status).toBe(400)
    expect(provider.analyzePlanning).not.toHaveBeenCalled()
  })

  it('41.d planning-analysis rechaza hechos críticos desconocidos con 422', async () => {
    const { handler, provider } = createHandler()
    const response = await handler(
      request('planning-analysis', {
        ...planningBody,
        facts: { ...planningBody.facts, projectedAvailableCents: null },
      }),
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'insufficient_planning_context',
    })
    expect(provider.analyzePlanning).not.toHaveBeenCalled()
  })

  it('41.e planning-analysis rechaza respuesta con campos financieros', async () => {
    const provider = createProvider()
    provider.analyzePlanning.mockResolvedValue({
      summary: 'Explicación',
      observations: [],
      considerations: [],
      projectedBalanceCents: 1,
    })
    const { handler } = createHandler({ provider })

    const response = await handler(request('planning-analysis', planningBody))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_provider_response',
    })
  })

  it('42. explain-changes llama únicamente al método correspondiente', async () => {
    const { handler, provider } = createHandler()
    await handler(request('explain-changes', explainBody))
    expect(provider.explainCategoryChanges).toHaveBeenCalledOnce()
    expect(provider.suggestCategory).not.toHaveBeenCalled()
    expect(provider.generatePeriodSummary).not.toHaveBeenCalled()
  })

  it('43. valida la respuesta del proveedor en servidor', async () => {
    const provider = createProvider()
    provider.suggestCategory.mockResolvedValue({
      categoryId: 'ajeno',
      confidence: 2,
    })
    const { handler } = createHandler({ provider })
    const response = await handler(request('suggest-category', suggestBody))
    expect(response.status).toBe(502)
    expectCors(response, webOrigin)
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_provider_response',
    })
  })

  it('43.a period-summary expone invalid_provider_response como HTTP 502', async () => {
    const provider = createProvider()
    provider.generatePeriodSummary.mockResolvedValue({
      text: 'Resumen',
      highlights: [],
      extra: true,
    })
    const { handler } = createHandler({ provider })

    const response = await handler(request('period-summary', summaryBody))

    expect(response.status).toBe(502)
    expectCors(response, webOrigin)
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_provider_response',
      message: 'El proveedor devolvió una respuesta inválida.',
    })
  })

  it('44. el proveedor desconocido falla de forma controlada', () => {
    expect(() =>
      createAIProvider({ provider: 'unknown', runtimeEnvironment: 'local' }),
    ).toThrowError(expect.objectContaining({ code: 'provider_unavailable' }))
    expect(() =>
      createAIProvider({ provider: 'mock', runtimeEnvironment: 'production' }),
    ).toThrowError(expect.objectContaining({ code: 'provider_unavailable' }))
  })

  it('44.a provider_unavailable devuelve 503 con CORS', async () => {
    const provider = createProvider()
    provider.suggestCategory.mockRejectedValue(
      new AIInsightsFunctionError('provider_unavailable'),
    )
    const { handler } = createHandler({ provider })
    const response = await handler(
      request('suggest-category', suggestBody, { origin: capacitorOrigin }),
    )
    expect(response.status).toBe(503)
    expectCors(response, capacitorOrigin)
  })

  it('45. el mock es determinista', async () => {
    const provider = new MockAIProvider()
    const input = { ...suggestBody }
    const first = await provider.suggestCategory(
      input,
      new AbortController().signal,
    )
    const second = await provider.suggestCategory(
      input,
      new AbortController().signal,
    )
    expect(second).toEqual(first)
    expect(first).toEqual({ categoryId, confidence: 0.8 })
  })

  it('46. el timeout se sanitiza', async () => {
    const provider = createProvider()
    provider.suggestCategory.mockImplementation(
      () => new Promise(() => undefined),
    )
    const { handler } = createHandler({ provider, timeoutMs: 1 })
    const response = await handler(request('suggest-category', suggestBody))
    expect(response.status).toBe(504)
    expectCors(response, webOrigin)
    await expect(response.json()).resolves.toEqual({
      code: 'provider_timeout',
      message: 'El proveedor excedió el tiempo límite.',
    })
  })

  it('47. no registra JWT', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { handler } = createHandler({ verifyToken: async () => null })
    await handler(request('suggest-category', suggestBody))
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining(token))
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining(token))
    log.mockRestore()
    error.mockRestore()
  })

  it('48. no registra descripciones completas', async () => {
    const description = 'descripción privada completa'
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { handler } = createHandler()
    await handler(request('suggest-category', { ...suggestBody, description }))
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining(description))
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining(description))
    log.mockRestore()
    error.mockRestore()
  })

  it('49. no persiste prompts o respuestas ni realiza fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const { handler } = createHandler()
    await handler(request('suggest-category', suggestBody))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
    storageSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
