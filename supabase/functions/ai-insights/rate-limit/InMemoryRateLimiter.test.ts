import type { AIProvider } from '../providers/AIProvider.ts'
import { createAIInsightsHandler } from '../router.ts'
import { InMemoryRateLimiter } from './InMemoryRateLimiter.ts'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'

describe('InMemoryRateLimiter', () => {
  it('50. permite las solicitudes 1 a 10 del mismo usuario', async () => {
    const limiter = new InMemoryRateLimiter()
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.consume(userA, 1_000)),
    )
    expect(results.every(({ allowed }) => allowed)).toBe(true)
    expect(results.at(-1)?.remaining).toBe(0)
  })

  it('51. rechaza la solicitud 11', async () => {
    const limiter = new InMemoryRateLimiter()
    for (let index = 0; index < 10; index += 1)
      await limiter.consume(userA, 1_000)
    await expect(limiter.consume(userA, 1_000)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    })
  })

  it('52. mantiene un contador independiente para el usuario B', async () => {
    const limiter = new InMemoryRateLimiter(1)
    await limiter.consume(userA, 1_000)
    expect((await limiter.consume(userA, 1_000)).allowed).toBe(false)
    expect((await limiter.consume(userB, 1_000)).allowed).toBe(true)
  })

  it('53. vuelve a permitir después de vencer la ventana', async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000)
    await limiter.consume(userA, 1_000)
    expect((await limiter.consume(userA, 60_999)).allowed).toBe(false)
    expect((await limiter.consume(userA, 61_000)).allowed).toBe(true)
  })

  it('54. devuelve un Retry-After coherente', async () => {
    const limiter = new InMemoryRateLimiter()
    const provider: AIProvider = {
      suggestCategory: async () => null,
      generatePeriodSummary: async () => ({ text: 'Resumen', highlights: [] }),
      explainCategoryChanges: async () => [],
      analyzePlanning: async () => ({
        summary: 'Explicación',
        observations: [],
        considerations: [],
      }),
    }
    const handler = createAIInsightsHandler({
      allowedOrigins: ['http://localhost:5173'],
      timeoutMs: 1_000,
      rateLimiter: {
        consume: () => limiter.consume(userA, 1_000),
      },
      now: () => 1_000,
      verifyToken: async () => ({ userId: userA }),
      createProvider: () => provider,
    })
    const makeRequest = () =>
      new Request(
        'http://localhost/functions/v1/ai-insights/suggest-category',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
            Origin: 'http://localhost:5173',
          },
          body: JSON.stringify({
            description: 'Compra',
            categories: [{ id: userA, name: 'Comida' }],
          }),
        },
      )
    for (let index = 0; index < 10; index += 1) await handler(makeRequest())
    const response = await handler(makeRequest())
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
  })

  it('55. limpia las entradas expiradas', async () => {
    const limiter = new InMemoryRateLimiter(10, 60_000)
    await limiter.consume(userA, 1_000)
    expect(limiter.trackedKeys).toBe(1)
    await limiter.consume(userB, 61_000)
    expect(limiter.trackedKeys).toBe(1)
  })

  it('56. acota el crecimiento con reloj controlado', async () => {
    const limiter = new InMemoryRateLimiter(10, 60_000, 2)
    await limiter.consume(userA, 1_000)
    await limiter.consume(userB, 1_001)
    await limiter.consume('33333333-3333-4333-8333-333333333333', 1_002)
    expect(limiter.trackedKeys).toBe(2)
  })
})
