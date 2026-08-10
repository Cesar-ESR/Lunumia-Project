export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RateLimiter {
  consume(key: string, now: number): Promise<RateLimitResult>
}
