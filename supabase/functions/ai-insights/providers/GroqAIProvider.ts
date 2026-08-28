import { z } from 'zod'
import {
  CategoryChangeExplanationsResponseSchema,
  CategorySuggestionResponseSchema,
  PeriodSummaryResponseSchema,
  PlanningAnalysisResponseSchema,
  type CategoryChangeExplanationsOutput,
  type CategorySuggestionOutput,
  type ExplainChangesInput,
  type PeriodSummaryInput,
  type PeriodSummaryOutput,
  type PlanningAnalysisInput,
  type PlanningAnalysisOutput,
  type SuggestCategoryInput,
} from '../contracts.ts'
import { AIInsightsFunctionError } from '../errors.ts'
import type { AIProvider } from './AIProvider.ts'
import {
  buildExplainChangesPromptContext,
  buildPeriodSummaryPromptContext,
  buildPlanningPromptContext,
} from './prompt-context.ts'

export const GROQ_CHAT_COMPLETIONS_URL =
  'https://api.groq.com/openai/v1/chat/completions' as const

export interface GroqAIProviderOptions {
  apiKey: string
  model: string
  fetcher?: typeof fetch
  now?: () => number
}

type GroqOperation =
  | 'suggest-category'
  | 'period-summary'
  | 'explain-changes'
  | 'planning-analysis'

type GroqDiagnosticType =
  | 'upstream_bad_request'
  | 'structured_output_validation_failed'
  | 'upstream_unprocessable'
  | 'rate_limit'
  | 'capacity'
  | 'timeout'
  | 'upstream_5xx'
  | 'provider_auth'
  | 'network_error'
  | 'invalid_json'
  | 'provider_refusal'
  | 'missing_content'
  | 'schema_validation_failed'
  | 'provider_config'
  | 'upstream_http_error'

type DiagnosticFields = Record<string, string | number | undefined>
type GroqRecovery = 'json_validate_failed_retry' | 'json_object_fallback'

interface CompletionAttemptOptions {
  attempt?: 1 | 2 | 3
  recovery?: GroqRecovery
  recoverStructuredOutputValidation?: boolean
}

const JSON_OBJECT_RESPONSE_FORMAT = { type: 'json_object' } as const
const PERIOD_SUMMARY_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'period_summary',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        highlights: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['text', 'highlights'],
      additionalProperties: false,
    },
  },
} as const
const PLANNING_ANALYSIS_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'planning_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 600 },
        observations: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 200 },
          maxItems: 4,
        },
        considerations: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 200 },
          maxItems: 3,
        },
      },
      required: ['summary', 'observations', 'considerations'],
      additionalProperties: false,
    },
  },
} as const
type GroqResponseFormat =
  | typeof JSON_OBJECT_RESPONSE_FORMAT
  | typeof PERIOD_SUMMARY_RESPONSE_FORMAT
  | typeof PLANNING_ANALYSIS_RESPONSE_FORMAT
const MAX_COMPLETION_TOKENS = 800
const REASONING_EFFORT = 'default'
const MESSAGE_COUNT = 2
const MAX_DIAGNOSTIC_TOKEN_LENGTH = 100

class StructuredOutputValidationFailure extends Error {
  constructor() {
    super('Structured output validation failed upstream.')
    this.name = 'StructuredOutputValidationFailure'
  }
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.unknown().optional(),
          refusal: z.unknown().optional(),
        }),
      }),
    )
    .min(1),
})

const suggestionEnvelopeSchema = z
  .object({
    categoryId: z.string().uuid().nullable(),
    confidence: z.number().finite().min(0).max(1).nullable(),
  })
  .strict()
  .refine(
    ({ categoryId, confidence }) =>
      (categoryId === null && confidence === null) ||
      (categoryId !== null && confidence !== null),
  )

const explanationsEnvelopeSchema = z
  .object({
    explanations: CategoryChangeExplanationsResponseSchema,
  })
  .strict()

export class GroqAIProvider implements AIProvider {
  private readonly apiKey: string
  private readonly model: string
  private readonly fetcher: typeof fetch
  private readonly now: () => number

  constructor(options: GroqAIProviderOptions) {
    this.apiKey = options.apiKey.trim()
    this.model = options.model.trim()
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? Date.now
    if (!this.apiKey || !this.model) {
      logDiagnostic({
        provider: 'groq',
        operation: 'initialization',
        phase: 'config',
        internalType: 'provider_config',
      })
      throw new AIInsightsFunctionError('provider_unavailable')
    }
  }

  async suggestCategory(
    input: SuggestCategoryInput,
    signal: AbortSignal,
  ): Promise<CategorySuggestionOutput> {
    const operation = 'suggest-category'
    const response = suggestionEnvelopeSchema.safeParse(
      await this.complete(
        operation,
        'Clasifica el gasto usando exclusivamente uno de los IDs proporcionados. Responde solo JSON con categoryId y confidence. Si no hay una coincidencia razonable, ambos deben ser null.',
        input,
        signal,
      ),
    )
    if (!response.success) {
      logSchemaValidationFailure(operation)
      throw new AIInsightsFunctionError('invalid_provider_response')
    }
    const output =
      response.data.categoryId === null
        ? null
        : {
            categoryId: response.data.categoryId,
            confidence: response.data.confidence,
          }
    return parseProviderOutput(
      CategorySuggestionResponseSchema,
      output,
      operation,
    )
  }

  async generatePeriodSummary(
    input: PeriodSummaryInput,
    signal: AbortSignal,
  ): Promise<PeriodSummaryOutput> {
    const operation = 'period-summary'
    const output = parseProviderOutput(
      PeriodSummaryResponseSchema,
      await this.complete(
        operation,
        'Redacta un resumen histórico breve en español usando únicamente los hechos recibidos. receivedIncome contiene sólo ingresos realizados; expected y cancelled no son ingresos históricos y no están incluidos. Todos los importes y porcentajes ya fueron calculados por la aplicación. Explícalos sin recalcular, estimar, sumar, restar, convertir, alterar o inventar cifras. No presentes proyecciones como hechos actuales. Reproduce literalmente los valores cuando los menciones. Responde solo JSON con text y highlights.',
        buildPeriodSummaryPromptContext(input),
        signal,
        PERIOD_SUMMARY_RESPONSE_FORMAT,
      ),
      operation,
    )
    logSchemaValidationSuccess(operation)
    return output
  }

  async explainCategoryChanges(
    input: ExplainChangesInput,
    signal: AbortSignal,
  ): Promise<CategoryChangeExplanationsOutput> {
    const operation = 'explain-changes'
    const response = explanationsEnvelopeSchema.safeParse(
      await this.complete(
        operation,
        'Explica brevemente en español cada cambio ya calculado. Conserva exactamente cada categoryId. Todos los importes y porcentajes proporcionados ya fueron calculados y formateados por la aplicación; reprodúcelos literalmente cuando los menciones. No realices cálculos, conversiones ni reformateos numéricos; no sumes, restes, modifiques porcentajes ni inventes cifras. Responde solo JSON con una propiedad explanations.',
        buildExplainChangesPromptContext(input),
        signal,
      ),
    )
    if (!response.success) {
      logSchemaValidationFailure(operation)
      throw new AIInsightsFunctionError('invalid_provider_response')
    }
    return response.data.explanations
  }

  async analyzePlanning(
    input: PlanningAnalysisInput,
    signal: AbortSignal,
  ): Promise<PlanningAnalysisOutput> {
    const operation = 'planning-analysis'
    const output = parseProviderOutput(
      PlanningAnalysisResponseSchema,
      await this.completeWithStructuredOutputRecovery(
        operation,
        'Explica brevemente en español la proyección usando exclusivamente los hechos suministrados. Todos los importes monetarios proporcionados ya están calculados y formateados por la aplicación en pesos mexicanos (MXN). Reprodúcelos literalmente cuando los menciones. No recalcules, conviertas, sumes, restes, reformatees ni inventes cifras. Un valor null significa desconocido y nunca significa cero. Los valores negativos son válidos. expectedIncome representa dinero futuro, no saldo actual. projectedClosingBalance es una estimación, no una certeza. Respeta exactamente projectionCoverage y projectionHorizonEnd; no definas otro horizonte. Si projectionCoverage es overdue_only, declara que la cobertura es limitada y no afirmes certeza del periodo completo. No apruebes gastos, no indiques montos seguros, no generes órdenes financieras y no sugieras modificar transacciones. Ninguna transacción se modifica: la respuesta es únicamente explicativa. Responde solo un objeto JSON con exactamente las propiedades summary, observations y considerations, sin propiedades adicionales.',
        buildPlanningPromptContext(input),
        signal,
        PLANNING_ANALYSIS_RESPONSE_FORMAT,
      ),
      operation,
    )
    logSchemaValidationSuccess(operation)
    return output
  }

  private async completeWithStructuredOutputRecovery(
    operation: GroqOperation,
    systemPrompt: string,
    input: unknown,
    signal: AbortSignal,
    responseFormat: GroqResponseFormat,
  ): Promise<unknown> {
    try {
      return await this.complete(
        operation,
        systemPrompt,
        input,
        signal,
        responseFormat,
        { attempt: 1, recoverStructuredOutputValidation: true },
      )
    } catch (reason) {
      if (!(reason instanceof StructuredOutputValidationFailure)) throw reason
    }

    try {
      return await this.complete(
        operation,
        systemPrompt,
        input,
        signal,
        responseFormat,
        {
          attempt: 2,
          recovery: 'json_validate_failed_retry',
          recoverStructuredOutputValidation: true,
        },
      )
    } catch (reason) {
      if (!(reason instanceof StructuredOutputValidationFailure)) throw reason
    }

    return this.complete(
      operation,
      systemPrompt,
      input,
      signal,
      JSON_OBJECT_RESPONSE_FORMAT,
      { attempt: 3, recovery: 'json_object_fallback' },
    )
  }

  private async complete(
    operation: GroqOperation,
    systemPrompt: string,
    input: unknown,
    signal: AbortSignal,
    responseFormat: GroqResponseFormat = JSON_OBJECT_RESPONSE_FORMAT,
    attemptOptions: CompletionAttemptOptions = {},
  ): Promise<unknown> {
    const startedAt = this.now()
    const userMessage = JSON.stringify(input)
    logDiagnostic({
      provider: 'groq',
      operation,
      phase: 'request',
      model: sanitizeDiagnosticToken(this.model),
      responseFormat: responseFormat.type,
      attempt: attemptOptions.attempt,
      recovery: attemptOptions.recovery,
      maxCompletionTokens: MAX_COMPLETION_TOKENS,
      reasoningEffort: REASONING_EFFORT,
      messageCount: MESSAGE_COUNT,
    })

    let response: Response
    try {
      response = await this.fetcher(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          response_format: responseFormat,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
        signal,
      })
    } catch (reason) {
      const aborted = signal.aborted || isAbortError(reason)
      logDiagnostic({
        provider: 'groq',
        operation,
        phase: 'transport',
        internalType: aborted ? 'timeout' : 'network_error',
        errorClass: readErrorClass(reason),
        durationMs: elapsedMilliseconds(startedAt, this.now()),
        responseFormat: responseFormat.type,
        attempt: attemptOptions.attempt,
        recovery: attemptOptions.recovery,
      })
      if (aborted) throw new AIInsightsFunctionError('provider_timeout')
      throw new AIInsightsFunctionError('provider_unavailable')
    }

    const durationMs = elapsedMilliseconds(startedAt, this.now())
    if (!response.ok) {
      const metadata = await readUpstreamErrorMetadata(response, [
        this.apiKey,
        systemPrompt,
        userMessage,
      ])
      const structuredOutputValidationFailure =
        isStructuredOutputValidationFailure(response.status, metadata)
      logDiagnostic({
        provider: 'groq',
        operation,
        phase: 'upstream',
        upstreamStatus: response.status,
        internalType: structuredOutputValidationFailure
          ? 'structured_output_validation_failed'
          : classifyGroqStatus(response.status),
        upstreamErrorType: metadata.type,
        upstreamErrorCode: metadata.code,
        durationMs,
        responseFormat: responseFormat.type,
        attempt: attemptOptions.attempt,
        recovery: attemptOptions.recovery,
      })
      if (
        structuredOutputValidationFailure &&
        attemptOptions.recoverStructuredOutputValidation
      )
        throw new StructuredOutputValidationFailure()
      throw mapGroqStatus(response.status)
    }

    logDiagnostic({
      provider: 'groq',
      operation,
      phase: 'response',
      upstreamStatus: response.status,
      durationMs,
      responseFormat: responseFormat.type,
      attempt: attemptOptions.attempt,
      recovery: attemptOptions.recovery,
    })

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      logJsonParseFailure(operation)
      throw new AIInsightsFunctionError('invalid_provider_response')
    }

    const completion = completionSchema.safeParse(responseBody)
    if (!completion.success) {
      logSchemaValidationFailure(operation)
      throw new AIInsightsFunctionError('invalid_provider_response')
    }

    const message = completion.data.choices[0]!.message
    if (typeof message.refusal === 'string') {
      logInvalidCompletionContent(operation, 'provider_refusal')
      throw new AIInsightsFunctionError('invalid_provider_response')
    }
    if (typeof message.content !== 'string') {
      logInvalidCompletionContent(operation, 'missing_content')
      throw new AIInsightsFunctionError('invalid_provider_response')
    }

    try {
      return JSON.parse(message.content) as unknown
    } catch {
      logJsonParseFailure(operation)
      throw new AIInsightsFunctionError('invalid_provider_response')
    }
  }
}

function parseProviderOutput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  operation: GroqOperation,
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    logSchemaValidationFailure(operation)
    throw new AIInsightsFunctionError('invalid_provider_response')
  }
  return parsed.data
}

function mapGroqStatus(status: number): AIInsightsFunctionError {
  if (status === 429) return new AIInsightsFunctionError('rate_limited')
  if (status === 408 || status === 504)
    return new AIInsightsFunctionError('provider_timeout')
  return new AIInsightsFunctionError('provider_unavailable')
}

function classifyGroqStatus(status: number): GroqDiagnosticType {
  if (status === 400) return 'upstream_bad_request'
  if (status === 401 || status === 403) return 'provider_auth'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 422) return 'upstream_unprocessable'
  if (status === 429) return 'rate_limit'
  if (status === 498) return 'capacity'
  if (status === 500 || status === 502 || status === 503) return 'upstream_5xx'
  return 'upstream_http_error'
}

function isStructuredOutputValidationFailure(
  status: number,
  metadata: { type?: string; code?: string },
): boolean {
  return (
    status === 400 &&
    metadata.type === 'invalid_request_error' &&
    metadata.code === 'json_validate_failed'
  )
}

async function readUpstreamErrorMetadata(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<{ type?: string; code?: string }> {
  try {
    const body: unknown = await response.json()
    if (!isRecord(body) || !isRecord(body.error)) return {}
    return {
      type: readDiagnosticToken(body.error.type, sensitiveValues),
      code: readDiagnosticToken(body.error.code, sensitiveValues),
    }
  } catch {
    return {}
  }
}

function readDiagnosticToken(
  value: unknown,
  sensitiveValues: readonly string[],
): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? sanitizeDiagnosticToken(String(value), sensitiveValues)
    : undefined
}

function sanitizeDiagnosticToken(
  value: string,
  sensitiveValues: readonly string[] = [],
): string {
  const redacted = sensitiveValues.reduce(
    (current, sensitiveValue) =>
      sensitiveValue ? current.replaceAll(sensitiveValue, 'redacted') : current,
    value,
  )
  const sanitized = redacted.replace(/[^a-zA-Z0-9._:/-]/g, '_')
  return sanitized.slice(0, MAX_DIAGNOSTIC_TOKEN_LENGTH) || 'unknown'
}

function readErrorClass(reason: unknown): string {
  if (isRecord(reason) && typeof reason.name === 'string')
    return sanitizeDiagnosticToken(reason.name)
  if (reason instanceof Error)
    return sanitizeDiagnosticToken(reason.constructor.name)
  return sanitizeDiagnosticToken(typeof reason)
}

function elapsedMilliseconds(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt))
}

function logJsonParseFailure(operation: GroqOperation): void {
  logDiagnostic({
    provider: 'groq',
    operation,
    phase: 'json_parse',
    internalType: 'invalid_json',
  })
}

function logSchemaValidationFailure(operation: GroqOperation): void {
  logDiagnostic({
    provider: 'groq',
    operation,
    phase: 'schema_validation',
    internalType: 'schema_validation_failed',
  })
}

function logSchemaValidationSuccess(operation: GroqOperation): void {
  logDiagnostic({
    provider: 'groq',
    operation,
    phase: 'schema_validation',
    schemaValidation: 'ok',
  })
}

function logInvalidCompletionContent(
  operation: GroqOperation,
  internalType: 'provider_refusal' | 'missing_content',
): void {
  logDiagnostic({
    provider: 'groq',
    operation,
    phase: 'completion_content',
    internalType,
  })
}

function logDiagnostic(fields: DiagnosticFields): void {
  const detail = Object.entries(fields)
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.info(`[ai] ${detail}`)
}

function isAbortError(reason: unknown): boolean {
  return isRecord(reason) && reason.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
