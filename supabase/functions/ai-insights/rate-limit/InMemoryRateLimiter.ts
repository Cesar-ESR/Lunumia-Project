import type { RateLimiter, RateLimitResult } from './RateLimiter.ts'

interface WindowEntry {
  count: number
  resetAt: number
}

/** Per-instance limiter for local development/tests; it is not distributed. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowEntry>()

  constructor(
    private readonly limit = 10,
    private readonly windowMs = 60_000,
    private readonly maxEntries = 10_000,
  ) {}

  async consume(key: string, now: number): Promise<RateLimitResult> {
    this.removeExpired(now)
    let entry = this.windows.get(key)
    if (!entry) {
      this.ensureCapacity()
      entry = { count: 0, resetAt: now + this.windowMs }
      this.windows.set(key, entry)
    }
    if (entry.count >= this.limit)
      return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    entry.count += 1
    return {
      allowed: true,
      remaining: this.limit - entry.count,
      resetAt: entry.resetAt,
    }
  }

  get trackedKeys(): number {
    return this.windows.size
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= now) this.windows.delete(key)
    }
  }

  private ensureCapacity(): void {
    if (this.windows.size < this.maxEntries) return
    let oldestKey: string | undefined
    let oldestReset = Number.POSITIVE_INFINITY
    for (const [key, entry] of this.windows) {
      if (entry.resetAt < oldestReset) {
        oldestKey = key
        oldestReset = entry.resetAt
      }
    }
    if (oldestKey !== undefined) this.windows.delete(oldestKey)
  }
}
