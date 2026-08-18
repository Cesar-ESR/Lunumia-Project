import { z } from 'zod'
import { OCRFunctionError } from '../errors/OCRFunctionError.ts'
import {
  MAX_RECEIPT_BYTES,
  ReceiptRecognitionResponseSchema,
} from '../schemas/contracts.ts'
import type { OCRProvider, OCRProviderInput } from './OCRProvider.ts'

export const GROQ_OCR_PROVIDER = 'groq' as const
export const GROQ_CHAT_COMPLETIONS_ENDPOINT =
  'https://api.groq.com/openai/v1/chat/completions'

const normalizedMoneySchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  .nullable()

const GroqReceiptSchema = z
  .object({
    merchant: z.string().trim().max(200).nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    subtotal: normalizedMoneySchema,
    tax: normalizedMoneySchema,
    tip: normalizedMoneySchema,
    discount: normalizedMoneySchema,
    otherFees: normalizedMoneySchema,
    total: normalizedMoneySchema,
    amountPaid: normalizedMoneySchema,
    amountEvidence: z.string().trim().max(200).nullable(),
    amountAmbiguous: z.boolean(),
    confidence: z.number().finite().min(0).max(1).nullable(),
  })
  .strict()

const GroqCompletionSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string() }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

const RECEIPT_PROMPT = `Extract only facts visibly printed on this receipt.
Return one JSON object with exactly these keys:
merchant, date, currency, subtotal, tax, tip, discount, otherFees, total,
amountPaid, amountEvidence, amountAmbiguous, confidence.

Rules:
- Never invent or infer a missing value. Use null when it cannot be read.
- Money fields must be normalized decimal strings such as "189.90", without
  symbols, currency codes, thousands separators, or calculations.
- total must be the printed final receipt total, never cash tendered, change,
  card authorization, subtotal, or tax. Do not calculate a missing total.
- Distinguish subtotal, tax, tip, discounts, other fees, cash tendered, change,
  and amount actually charged. amountPaid is the final amount charged, not
  cash handed to the cashier.
- Use YYYY-MM-DD only when the full printed date is unambiguous.
- Use an ISO 4217 code only when visibly supported. Never assume MXN from the
  language and never convert currencies.
- amountEvidence is a short verbatim visible fragment identifying total, for
  example "TOTAL $189.90"; otherwise null.
- amountAmbiguous is true when multiple plausible final totals remain.
- confidence is only your extraction clarity signal from 0 to 1, or null. It
  never authorizes a financial action.`

export interface GroqVisionOCRProviderOptions {
  apiKey: string
  model: string
  fetcher?: typeof fetch
}

export class GroqVisionOCRProvider implements OCRProvider {
  private readonly apiKey: string
  private readonly model: string
  private readonly fetcher: typeof fetch

  constructor(options: GroqVisionOCRProviderOptions) {
    this.apiKey = options.apiKey.trim()
    this.model = options.model.trim()
    this.fetcher = options.fetcher ?? fetch
    if (!this.apiKey || !this.model)
      throw new OCRFunctionError('provider_unavailable')
  }

  async recognize(input: OCRProviderInput, signal: AbortSignal) {
    if (input.imageBytes.length >= MAX_RECEIPT_BYTES)
      throw new OCRFunctionError('payload_too_large')
    let response: Response
    try {
      response = await this.fetcher(GROQ_CHAT_COMPLETIONS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          reasoning_effort: 'none',
          max_completion_tokens: 900,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: RECEIPT_PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${input.mimeType};base64,${bytesToBase64(input.imageBytes)}`,
                  },
                },
              ],
            },
          ],
        }),
        signal,
      })
    } catch (reason) {
      if (signal.aborted || isAbortError(reason))
        throw new OCRFunctionError('provider_timeout')
      throw new OCRFunctionError('provider_unavailable')
    }

    if (!response.ok) throw mapGroqStatus(response.status)

    try {
      const completion = GroqCompletionSchema.parse(await response.json())
      const extracted = GroqReceiptSchema.parse(
        JSON.parse(completion.choices[0]!.message.content),
      )
      return ReceiptRecognitionResponseSchema.parse({
        merchant: extracted.merchant,
        date: extracted.date,
        currency: extracted.currency,
        subtotal: parseOCRDecimalCents(extracted.subtotal),
        tax: parseOCRDecimalCents(extracted.tax),
        tip: parseOCRDecimalCents(extracted.tip),
        discount: parseOCRDecimalCents(extracted.discount),
        otherFees: parseOCRDecimalCents(extracted.otherFees),
        total: parseOCRDecimalCents(extracted.total),
        amountPaid: parseOCRDecimalCents(extracted.amountPaid),
        amountEvidence: extracted.amountEvidence,
        amountAmbiguous: extracted.amountAmbiguous,
        confidence: extracted.confidence,
        rawText: null,
      })
    } catch {
      throw new OCRFunctionError('invalid_provider_response')
    }
  }
}

export function parseOCRDecimalCents(value: string | null): number | null {
  if (value === null) return null
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) return null
  try {
    const magnitude =
      BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
    const cents = match[1] === '-' ? -magnitude : magnitude
    return cents >= BigInt(Number.MIN_SAFE_INTEGER) &&
      cents <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(cents)
      : null
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  return btoa(binary)
}

function mapGroqStatus(status: number): OCRFunctionError {
  if (status === 429) return new OCRFunctionError('rate_limited')
  if (status === 408 || status === 504)
    return new OCRFunctionError('provider_timeout')
  if (status === 400 || status === 413 || status === 415)
    return new OCRFunctionError('invalid_image')
  return new OCRFunctionError('provider_unavailable')
}

function isAbortError(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'name' in reason &&
    reason.name === 'AbortError'
  )
}
