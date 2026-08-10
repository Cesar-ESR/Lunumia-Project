import { decodeReceiptImage } from './decode-image.ts'
import { OCRFunctionError } from './errors/OCRFunctionError.ts'
import type { OCRProvider } from './providers/OCRProvider.ts'
import {
  parseRecognitionRequest,
  ReceiptRecognitionResponseSchema,
} from './schemas/contracts.ts'
import { corsHeaders, jsonResponse, readBearerToken } from '../_shared/http.ts'
import { runWithTimeout } from '../_shared/timeout.ts'
import {
  RateLimitStorageError,
  type DistributedRateLimiter,
} from '../_shared/distributed-rate-limiter.ts'

export interface RecognizeReceiptDependencies {
  allowedOrigins: readonly string[]
  timeoutMs: number
  rateLimiter: DistributedRateLimiter
  verifyToken(token: string): Promise<{ userId: string } | null>
  createProvider(): OCRProvider
}

export function createRecognizeReceiptHandler(
  dependencies: RecognizeReceiptDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin')
    if (origin !== null && !dependencies.allowedOrigins.includes(origin))
      return errorResponse(new OCRFunctionError('unknown'), null, 403)

    if (request.method === 'OPTIONS') {
      if (!origin)
        return errorResponse(new OCRFunctionError('unknown'), null, 400)
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      })
    }
    if (request.method !== 'POST')
      return errorResponse(new OCRFunctionError('unknown'), origin, 405)

    const token = readBearerToken(request.headers.get('Authorization'))
    if (!token)
      return errorResponse(new OCRFunctionError('unauthenticated'), origin)

    try {
      const identity = await dependencies.verifyToken(token)
      if (!identity) throw new OCRFunctionError('unauthenticated')

      const now = Date.now()
      const rateLimit = await dependencies.rateLimiter.consume(token)
      if (!rateLimit.allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil((rateLimit.resetAt - now) / 1_000),
        )
        return errorResponse(
          new OCRFunctionError('rate_limited'),
          origin,
          undefined,
          { 'Retry-After': String(retryAfter) },
        )
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        throw new OCRFunctionError('invalid_image')
      }
      const input = parseRecognitionRequest(body)
      const imageBytes = decodeReceiptImage(input.imageBase64, input.mimeType)
      const provider = dependencies.createProvider()
      const result = await runWithTimeout(
        dependencies.timeoutMs,
        (signal) =>
          provider.recognize({ imageBytes, mimeType: input.mimeType }, signal),
        () => new OCRFunctionError('provider_timeout'),
      )
      const validated = ReceiptRecognitionResponseSchema.safeParse(result)
      if (!validated.success)
        throw new OCRFunctionError('invalid_provider_response')
      return jsonResponse(200, validated.data, origin)
    } catch (reason) {
      return errorResponse(
        reason instanceof OCRFunctionError
          ? reason
          : reason instanceof RateLimitStorageError
            ? new OCRFunctionError('rate_limit_unavailable')
            : new OCRFunctionError('unknown'),
        origin,
      )
    }
  }
}

function errorResponse(
  error: OCRFunctionError,
  origin: string | null,
  overrideStatus?: number,
  headers?: HeadersInit,
) {
  return jsonResponse(
    overrideStatus ?? error.status,
    { code: error.code, message: error.message },
    origin,
    headers,
  )
}
