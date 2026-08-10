import {
  AI_REQUEST_LIMITS,
  ExplainChangesRequestSchema,
  InvalidAIResponseError,
  parseCategoryChangeExplanations,
  parseCategorySuggestion,
  parsePeriodSummary,
  PeriodSummaryRequestSchema,
  SuggestCategoryRequestSchema,
} from '@application/contracts'
import type {
  AIInsightsProvider,
  CalculatedCategoryChange,
  CategoryChangeExplanation,
  CategorySuggestion,
  PeriodAggregatedData,
  PeriodSummary,
} from '@domain/ports'
import { AIInsightsError, type AIErrorCode } from './AIInsightsError'

const functionErrorCodes = new Set<AIErrorCode>([
  'unauthenticated',
  'invalid_request',
  'description_too_long',
  'too_many_categories',
  'rate_limited',
  'rate_limit_unavailable',
  'provider_timeout',
  'provider_unavailable',
  'invalid_provider_response',
  'invalid_ai_response',
  'network_error',
  'unknown',
])

export interface AIFunctionsClient {
  functions: {
    invoke(
      functionName: string,
      options: { method: 'POST'; body: Record<string, unknown> },
    ): Promise<{ data: unknown; error: unknown }>
  }
}

export class EdgeFunctionAIAdapter implements AIInsightsProvider {
  constructor(private readonly client: AIFunctionsClient) {}

  async suggestCategory(
    description: string,
    categories: ReadonlyArray<{ id: string; name: string }>,
  ): Promise<CategorySuggestion | null> {
    const request = parseLocalRequest(SuggestCategoryRequestSchema, {
      description,
      categories,
    })
    const data = await this.invoke('suggest-category', request)
    return this.parseResponse(() =>
      parseCategorySuggestion(
        data,
        new Set(request.categories.map(({ id }) => id)),
      ),
    )
  }

  async generatePeriodSummary(
    aggregatedData: PeriodAggregatedData,
  ): Promise<PeriodSummary> {
    const request = parseLocalRequest(PeriodSummaryRequestSchema, {
      aggregatedData,
    })
    const data = await this.invoke('period-summary', request)
    return this.parseResponse(() => parsePeriodSummary(data))
  }

  async explainCategoryChanges(
    changes: ReadonlyArray<CalculatedCategoryChange>,
  ): Promise<ReadonlyArray<CategoryChangeExplanation>> {
    const request = parseLocalRequest(ExplainChangesRequestSchema, { changes })
    const data = await this.invoke('explain-changes', request)
    return this.parseResponse(() =>
      parseCategoryChangeExplanations(
        data,
        new Set(request.changes.map(({ categoryId }) => categoryId)),
      ),
    )
  }

  private async invoke(
    route: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const { data, error } = await this.client.functions.invoke(
        `ai-insights/${route}`,
        { method: 'POST', body },
      )
      if (error) throw await translateFunctionError(error)
      return data
    } catch (reason) {
      if (reason instanceof AIInsightsError) throw reason
      if (reason instanceof DOMException && reason.name === 'AbortError')
        throw new AIInsightsError('provider_timeout', { cause: reason })
      if (reason instanceof TypeError)
        throw new AIInsightsError('network_error', { cause: reason })
      throw new AIInsightsError('unknown', {
        cause: reason instanceof Error ? reason : undefined,
      })
    }
  }

  private parseResponse<T>(parse: () => T): T {
    try {
      return parse()
    } catch (reason) {
      if (reason instanceof InvalidAIResponseError)
        throw new AIInsightsError('invalid_ai_response', { cause: reason })
      throw reason
    }
  }
}

function parseLocalRequest<T extends Record<string, unknown>>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false }
  },
  value: unknown,
): T {
  if (
    isRecord(value) &&
    typeof value.description === 'string' &&
    value.description.length > AI_REQUEST_LIMITS.description
  )
    throw new AIInsightsError('description_too_long')
  if (hasTooManyCategories(value))
    throw new AIInsightsError('too_many_categories')
  const result = schema.safeParse(value)
  if (!result.success) throw new AIInsightsError('invalid_request')
  return result.data
}

function hasTooManyCategories(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (Array.isArray(value.categories))
    return value.categories.length > AI_REQUEST_LIMITS.categories
  if (Array.isArray(value.changes))
    return value.changes.length > AI_REQUEST_LIMITS.categories
  return (
    isRecord(value.aggregatedData) &&
    Array.isArray(value.aggregatedData.categoryBreakdown) &&
    value.aggregatedData.categoryBreakdown.length > AI_REQUEST_LIMITS.categories
  )
}

async function translateFunctionError(
  reason: unknown,
): Promise<AIInsightsError> {
  const status = readStatus(reason)
  const code = await readStableCode(reason)
  const retryAfterSeconds = readRetryAfter(reason)
  if (code && functionErrorCodes.has(code as AIErrorCode))
    return new AIInsightsError(code as AIErrorCode, { retryAfterSeconds })
  if (status === 401) return new AIInsightsError('unauthenticated')
  if (status === 400) return new AIInsightsError('invalid_request')
  if (status === 429)
    return new AIInsightsError('rate_limited', { retryAfterSeconds })
  if (status === 504) return new AIInsightsError('provider_timeout')
  if (status === 502) return new AIInsightsError('invalid_provider_response')
  if (status === 503) return new AIInsightsError('provider_unavailable')
  if (readName(reason) === 'FunctionsFetchError')
    return new AIInsightsError('network_error')
  return new AIInsightsError('unknown')
}

function readRetryAfter(value: unknown): number | null {
  if (!isRecord(value) || !(value.context instanceof Response)) return null
  const parsed = Number(value.context.headers.get('Retry-After'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readStatus(value: unknown): number | null {
  if (!isRecord(value)) return null
  if (typeof value.status === 'number') return value.status
  return value.context instanceof Response ? value.context.status : null
}

function readName(value: unknown): string | null {
  return isRecord(value) && typeof value.name === 'string' ? value.name : null
}

async function readStableCode(value: unknown): Promise<string | null> {
  if (!isRecord(value)) return null
  if (typeof value.code === 'string') return value.code
  if (!(value.context instanceof Response)) return null
  try {
    const payload: unknown = await value.context.clone().json()
    return isRecord(payload) && typeof payload.code === 'string'
      ? payload.code
      : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
