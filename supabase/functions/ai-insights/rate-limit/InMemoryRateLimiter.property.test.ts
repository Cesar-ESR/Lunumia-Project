import fc from 'fast-check'
import { InMemoryRateLimiter } from './InMemoryRateLimiter.ts'

interface ModelWindow {
  count: number
  resetAt: number
}

describe('propiedades de InMemoryRateLimiter', () => {
  it('Feature: gasto-claro-app, Property AI-4: coincide con una ventana pura por usuario', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            elapsed: fc.integer({ min: 0, max: 70_000 }),
            user: fc.integer({ min: 0, max: 12 }),
          }),
          { minLength: 1, maxLength: 150 },
        ),
        async (requests) => {
          const limiter = new InMemoryRateLimiter(10, 60_000, 100)
          const model = new Map<number, ModelWindow>()
          let now = 0
          for (const request of requests) {
            now += request.elapsed
            for (const [user, window] of model)
              if (window.resetAt <= now) model.delete(user)
            let expected = model.get(request.user)
            if (!expected) {
              expected = { count: 0, resetAt: now + 60_000 }
              model.set(request.user, expected)
            }
            const expectedAllowed = expected.count < 10
            if (expectedAllowed) expected.count += 1

            const actual = await limiter.consume(String(request.user), now)
            expect(actual.allowed).toBe(expectedAllowed)
            expect(actual.remaining).toBe(Math.max(0, 10 - expected.count))
            expect(actual.resetAt).toBe(expected.resetAt)
            expect(actual.remaining).toBeGreaterThanOrEqual(0)
            expect(limiter.trackedKeys).toBeLessThanOrEqual(100)
          }
        },
      ),
      { numRuns: 150 },
    )
  })

  it('cubre exactamente t=0, t=59.999 y t=60.000 con usuarios aislados', async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000)
    expect(await limiter.consume('A', 0)).toEqual({
      allowed: true,
      remaining: 0,
      resetAt: 60_000,
    })
    expect((await limiter.consume('A', 59_999)).allowed).toBe(false)
    expect((await limiter.consume('B', 59_999)).allowed).toBe(true)
    expect((await limiter.consume('A', 60_000)).allowed).toBe(true)
  })
})
