import { corsHeaders, jsonResponse, readBearerToken } from '../_shared/http.ts'
import { runWithTimeout } from '../_shared/timeout.ts'
import {
  RateLimitStorageError,
  type DistributedRateLimiter,
} from '../_shared/distributed-rate-limiter.ts'
import {
  CategoryChangeExplanationsResponseSchema,
  CategorySuggestionResponseSchema,
  parseExplainChangesRequest,
  parsePeriodSummaryRequest,
  parseSuggestCategoryRequest,
  PeriodSummaryResponseSchema,
} from './contracts.ts'
import { AIInsightsFunctionError } from './errors.ts'
import type { AIProvider } from './providers/AIProvider.ts'

type AIRoute = 'suggest-category' | 'period-summary' | 'explain-changes'
const routes = new Set<AIRoute>([
  'suggest-category',
  'period-summary',
  'explain-changes',
])

export interface AIInsightsDependencies {
  allowedOrigins: readonly string[]
  timeoutMs: number
  rateLimiter: DistributedRateLimiter
  now(): number
  verifyToken(token: string): Promise<{ userId: string } | null>
  createProvider(): AIProvider
}

export function createAIInsightsHandler(dependencies: AIInsightsDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin')
    if (origin !== null && !dependencies.allowedOrigins.includes(origin))
      return errorResponse(
        new AIInsightsFunctionError('forbidden_origin'),
        null,
      )

    if (request.method === 'OPTIONS') {
      if (!origin)
        return errorResponse(
          new AIInsightsFunctionError('invalid_request'),
          null,
        )
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method !== 'POST')
      return errorResponse(
        new AIInsightsFunctionError('method_not_allowed'),
        origin,
      )

    const route = readRoute(request.url)
    if (!route)
      return errorResponse(new AIInsightsFunctionError('not_found'), origin)

    const token = readBearerToken(request.headers.get('Authorization'))
    if (!token)
      return errorResponse(
        new AIInsightsFunctionError('unauthenticated'),
        origin,
      )

    try {
      const identity = await dependencies.verifyToken(token)
      if (!identity) throw new AIInsightsFunctionError('unauthenticated')

      const now = dependencies.now()
      const rateLimit = await dependencies.rateLimiter.consume(token)
      if (!rateLimit.allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil((rateLimit.resetAt - now) / 1_000),
        )
        return errorResponse(
          new AIInsightsFunctionError('rate_limited'),
          origin,
          { 'Retry-After': String(retryAfter) },
        )
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        throw new AIInsightsFunctionError('invalid_request')
      }
      const provider = dependencies.createProvider()
      const response = await executeRoute(
        route,
        body,
        provider,
        dependencies.timeoutMs,
      )
      return jsonResponse(200, response, origin)
    } catch (reason) {
      return errorResponse(
        reason instanceof AIInsightsFunctionError
          ? reason
          : reason instanceof RateLimitStorageError
            ? new AIInsightsFunctionError('rate_limit_unavailable')
            : new AIInsightsFunctionError('unknown'),
        origin,
      )
    }
  }
}

async function executeRoute(
  route: AIRoute,
  body: unknown,
  provider: AIProvider,
  timeoutMs: number,
): Promise<unknown> {
  if (route === 'suggest-category') {
    const input = parseSuggestCategoryRequest(body)
    const result = await withProviderTimeout(timeoutMs, (signal) =>
      provider.suggestCategory(input, signal),
    )
    const parsed = CategorySuggestionResponseSchema.safeParse(result)
    if (
      !parsed.success ||
      (parsed.data !== null &&
        !input.categories.some(({ id }) => id === parsed.data?.categoryId))
    )
      throw new AIInsightsFunctionError('invalid_provider_response')
    return parsed.data
  }

  if (route === 'period-summary') {
    const input = parsePeriodSummaryRequest(body)
    const result = await withProviderTimeout(timeoutMs, (signal) =>
      provider.generatePeriodSummary(input, signal),
    )
    const parsed = PeriodSummaryResponseSchema.safeParse(result)
    if (!parsed.success)
      throw new AIInsightsFunctionError('invalid_provider_response')
    return parsed.data
  }

  const input = parseExplainChangesRequest(body)
  const result = await withProviderTimeout(timeoutMs, (signal) =>
    provider.explainCategoryChanges(input, signal),
  )
  const parsed = CategoryChangeExplanationsResponseSchema.safeParse(result)
  const requestedIds = new Set(
    input.changes.map(({ categoryId }) => categoryId),
  )
  if (
    !parsed.success ||
    parsed.data.length !== requestedIds.size ||
    parsed.data.some(({ categoryId }) => !requestedIds.has(categoryId))
  )
    throw new AIInsightsFunctionError('invalid_provider_response')
  return parsed.data
}

function withProviderTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runWithTimeout(
    timeoutMs,
    operation,
    () => new AIInsightsFunctionError('provider_timeout'),
  )
}

function readRoute(url: string): AIRoute | null {
  const segments = new URL(url).pathname.split('/').filter(Boolean)
  const functionIndex = segments.lastIndexOf('ai-insights')
  const candidate =
    functionIndex >= 0 ? segments[functionIndex + 1] : segments.at(-1)
  return candidate && routes.has(candidate as AIRoute)
    ? (candidate as AIRoute)
    : null
}

function errorResponse(
  error: AIInsightsFunctionError,
  origin: string | null,
  headers?: HeadersInit,
): Response {
  return jsonResponse(
    error.status,
    { code: error.code, message: error.message },
    origin,
    headers,
  )
}
