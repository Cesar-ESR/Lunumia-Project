import { describe, expect, it, vi } from 'vitest'
import {
  PostgresRateLimiter,
  RateLimitStorageError,
} from './distributed-rate-limiter'

describe('PostgresRateLimiter', () => {
  it('envía solo alcance y política; la identidad queda ligada al JWT', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          allowed: true,
          remaining: 9,
          reset_at: '2026-08-10T03:40:00.000Z',
        },
      ],
      error: null,
    }))
    const createClient = vi.fn(() => ({ rpc }))
    const limiter = new PostgresRateLimiter(createClient, 'ai-insights')

    await expect(limiter.consume('private-jwt')).resolves.toEqual({
      allowed: true,
      remaining: 9,
      resetAt: Date.parse('2026-08-10T03:40:00.000Z'),
    })
    expect(createClient).toHaveBeenCalledWith('private-jwt')
    expect(rpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_scope: 'ai-insights',
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('private-jwt')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('user_id')
  })

  it.each([
    [{ data: null, error: { message: 'database unavailable' } }],
    [{ data: [], error: null }],
    [
      {
        data: [{ allowed: 'yes', remaining: 1, reset_at: 'not-a-date' }],
        error: null,
      },
    ],
  ])('normaliza fallos del almacén sin filtrar detalles', async (rpcResult) => {
    const limiter = new PostgresRateLimiter(
      () => ({ rpc: vi.fn(async () => rpcResult) }),
      'recognize-receipt',
    )
    await expect(limiter.consume('private-jwt')).rejects.toEqual(
      new RateLimitStorageError(),
    )
  })
})
