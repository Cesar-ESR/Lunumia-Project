import {
  InvalidOCRResponseError,
  parseReceiptRecognitionResult,
} from '@application/contracts/receipt-result.schema'
import type {
  ReceiptRecognitionInput,
  ReceiptRecognitionProvider,
  ReceiptRecognitionResult,
} from '@domain/ports'
import {
  ReceiptRecognitionError,
  type ReceiptRecognitionErrorKind,
} from './ReceiptRecognitionError'

const functionErrorKinds = new Set<string>([
  'unauthenticated',
  'invalid_image',
  'payload_too_large',
  'provider_timeout',
  'provider_unavailable',
  'rate_limited',
  'rate_limit_unavailable',
  'invalid_provider_response',
  'network_error',
  'unknown',
])

export interface OCRFunctionsClient {
  functions: {
    invoke(
      functionName: string,
      options: {
        method: 'POST'
        body: Record<string, unknown>
      },
    ): Promise<{ data: unknown; error: unknown }>
  }
}

export class EdgeFunctionOCRAdapter implements ReceiptRecognitionProvider {
  constructor(private readonly client: OCRFunctionsClient) {}

  async recognize(
    input: ReceiptRecognitionInput,
  ): Promise<ReceiptRecognitionResult> {
    if (
      !input.imageBase64 ||
      !['image/jpeg', 'image/png'].includes(input.mimeType)
    )
      throw new ReceiptRecognitionError('invalid_image')
    try {
      const { data, error } = await this.client.functions.invoke(
        'recognize-receipt',
        {
          method: 'POST',
          body: {
            imageBase64: input.imageBase64,
            mimeType: input.mimeType,
          },
        },
      )
      if (error) throw await translateFunctionError(error)
      return parseReceiptRecognitionResult(data)
    } catch (reason) {
      if (reason instanceof ReceiptRecognitionError) throw reason
      if (reason instanceof InvalidOCRResponseError)
        throw new ReceiptRecognitionError('invalid_provider_response', {
          cause: reason,
        })
      if (reason instanceof DOMException && reason.name === 'AbortError')
        throw new ReceiptRecognitionError('provider_timeout', { cause: reason })
      if (reason instanceof TypeError)
        throw new ReceiptRecognitionError('network_error', { cause: reason })
      throw new ReceiptRecognitionError('unknown', {
        cause: reason instanceof Error ? reason : undefined,
      })
    }
  }
}

async function translateFunctionError(
  reason: unknown,
): Promise<ReceiptRecognitionError> {
  const status = readStatus(reason)
  const code = await readStableCode(reason)
  if (code && isFunctionErrorKind(code))
    return new ReceiptRecognitionError(code)
  if (status === 401) return new ReceiptRecognitionError('unauthenticated')
  if (status === 413) return new ReceiptRecognitionError('payload_too_large')
  if (status === 429) return new ReceiptRecognitionError('rate_limited')
  if (status === 504) return new ReceiptRecognitionError('provider_timeout')
  if (status === 502)
    return new ReceiptRecognitionError('invalid_provider_response')
  if (status === 503) return new ReceiptRecognitionError('provider_unavailable')
  if (readName(reason) === 'FunctionsFetchError')
    return new ReceiptRecognitionError('network_error')
  return new ReceiptRecognitionError('unknown')
}

function isFunctionErrorKind(
  value: string,
): value is ReceiptRecognitionErrorKind {
  return functionErrorKinds.has(value)
}

function readStatus(value: unknown): number | null {
  if (!isRecord(value)) return null
  if (typeof value.status === 'number') return value.status
  const context = value.context
  return context instanceof Response ? context.status : null
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
