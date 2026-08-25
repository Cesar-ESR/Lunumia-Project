import { z } from 'zod'
import { OCRFunctionError } from '../errors/OCRFunctionError.ts'

// Groq limits requests containing a base64 image to 4 MiB. Three million raw
// bytes encode to four million base64 characters and leave room for JSON/prompt.
export const MAX_RECEIPT_BYTES = 3_000_000
export const MAX_BASE64_LENGTH = Math.ceil(MAX_RECEIPT_BYTES / 3) * 4
export const MAX_LEGACY_RECEIPT_BYTES = 10 * 1024 * 1024
export const MAX_LEGACY_BASE64_LENGTH =
  Math.ceil(MAX_LEGACY_RECEIPT_BYTES / 3) * 4
export const MAX_RAW_TEXT_LENGTH = 20_000
export const MAX_AMOUNT_EVIDENCE_LENGTH = 200

export const LegacyReceiptRecognitionRequestSchema = z
  .object({
    imageBase64: z.string().min(1).max(MAX_LEGACY_BASE64_LENGTH),
    mimeType: z.enum(['image/jpeg', 'image/png']),
  })
  .strict()

export const ReceiptRecognitionRequestV2Schema = z
  .object({
    imageBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    responseVersion: z.literal(2),
  })
  .strict()

export const ReceiptRecognitionRequestSchema = z.union([
  LegacyReceiptRecognitionRequestSchema,
  ReceiptRecognitionRequestV2Schema,
])

const dateOnlySchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return (
    year !== undefined &&
    month !== undefined &&
    day !== undefined &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
})

export const ReceiptRecognitionResponseSchema = z
  .object({
    merchant: z.string().trim().max(200).nullable(),
    date: dateOnlySchema.nullable(),
    subtotal: z.number().int().finite().safe().nullable(),
    tax: z.number().int().finite().safe().nullable(),
    tip: z.number().int().finite().safe().nullable(),
    discount: z.number().int().finite().safe().nullable(),
    otherFees: z.number().int().finite().safe().nullable(),
    total: z.number().int().finite().safe().nullable(),
    amountPaid: z.number().int().finite().safe().nullable(),
    amountEvidence: z
      .string()
      .trim()
      .max(MAX_AMOUNT_EVIDENCE_LENGTH)
      .nullable(),
    amountAmbiguous: z.boolean(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    confidence: z.number().finite().min(0).max(1).nullable(),
    rawText: z.string().max(MAX_RAW_TEXT_LENGTH).nullable(),
  })
  .strict()

export const LegacyReceiptRecognitionResponseSchema = z
  .object({
    merchant: z.string().trim().max(200).nullable(),
    date: dateOnlySchema.nullable(),
    total: z.number().int().finite().nonnegative().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    confidence: z.number().finite().min(0).max(1),
    rawText: z.string().max(MAX_RAW_TEXT_LENGTH).nullable(),
  })
  .strict()

export type ReceiptResponseVersion = 'legacy' | 2
export interface ReceiptRecognitionRequest {
  imageBase64: string
  mimeType: 'image/jpeg' | 'image/png'
  responseVersion: ReceiptResponseVersion
}
export type ReceiptRecognitionResponse = z.infer<
  typeof ReceiptRecognitionResponseSchema
>
export type LegacyReceiptRecognitionResponse = z.infer<
  typeof LegacyReceiptRecognitionResponseSchema
>

export function parseRecognitionRequest(
  value: unknown,
): ReceiptRecognitionRequest {
  if (
    isRecord(value) &&
    'responseVersion' in value &&
    value.responseVersion !== 2
  )
    throw new OCRFunctionError('unsupported_response_version')

  const isV2 = isRecord(value) && value.responseVersion === 2
  const maximum = isV2 ? MAX_BASE64_LENGTH : MAX_LEGACY_BASE64_LENGTH
  if (
    isRecord(value) &&
    typeof value.imageBase64 === 'string' &&
    value.imageBase64.length > maximum
  )
    throw new OCRFunctionError('payload_too_large')
  const parsed = (
    isV2
      ? ReceiptRecognitionRequestV2Schema
      : LegacyReceiptRecognitionRequestSchema
  ).safeParse(value)
  if (!parsed.success) throw new OCRFunctionError('invalid_image')
  return {
    imageBase64: parsed.data.imageBase64,
    mimeType: parsed.data.mimeType,
    responseVersion: isV2 ? 2 : 'legacy',
  }
}

export function formatRecognitionResponse(
  result: ReceiptRecognitionResponse,
  version: ReceiptResponseVersion,
): ReceiptRecognitionResponse | LegacyReceiptRecognitionResponse {
  const canonical = ReceiptRecognitionResponseSchema.parse(result)
  if (version === 2) return canonical
  return LegacyReceiptRecognitionResponseSchema.parse({
    merchant: canonical.merchant,
    date: canonical.date,
    total:
      canonical.total !== null && canonical.total >= 0 ? canonical.total : null,
    currency: canonical.currency,
    confidence: canonical.confidence ?? 0,
    rawText: canonical.rawText,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
