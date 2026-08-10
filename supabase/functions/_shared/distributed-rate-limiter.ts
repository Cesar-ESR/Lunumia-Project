import { z } from 'zod'

export type RateLimitScope = 'ai-insights' | 'recognize-receipt'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface DistributedRateLimiter {
  consume(token: string): Promise<RateLimitResult>
}

interface RpcClient {
  rpc(
    functionName: 'consume_rate_limit',
    parameters: {
      p_scope: RateLimitScope
    },
  ): Promise<{ data: unknown; error: unknown }>
}

const ResultSchema = z
  .array(
    z.object({
      allowed: z.boolean(),
      remaining: z.number().int().nonnegative(),
      reset_at: z.string().datetime({ offset: true }),
    }),
  )
  .length(1)

export class RateLimitStorageError extends Error {
  constructor() {
    super('The rate-limit store is unavailable.')
    this.name = 'RateLimitStorageError'
  }
}

export class PostgresRateLimiter implements DistributedRateLimiter {
  constructor(
    private readonly createAuthenticatedClient: (token: string) => RpcClient,
    private readonly scope: RateLimitScope,
  ) {}

  async consume(token: string): Promise<RateLimitResult> {
    try {
      const client = this.createAuthenticatedClient(token)
      const { data, error } = await client.rpc('consume_rate_limit', {
        p_scope: this.scope,
      })
      if (error) throw new RateLimitStorageError()

      const parsed = ResultSchema.safeParse(data)
      if (!parsed.success) throw new RateLimitStorageError()
      const result = parsed.data[0]!
      return {
        allowed: result.allowed,
        remaining: result.remaining,
        resetAt: Date.parse(result.reset_at),
      }
    } catch (reason) {
      if (reason instanceof RateLimitStorageError) throw reason
      throw new RateLimitStorageError()
    }
  }
}
