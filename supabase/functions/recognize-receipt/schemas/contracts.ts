import { z } from 'zod'
import { OCRFunctionError } from '../errors/OCRFunctionError.ts'

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
export const MAX_BASE64_LENGTH = Math.ceil(MAX_RECEIPT_BYTES / 3) * 4
export const MAX_RAW_TEXT_LENGTH = 20_000

export const ReceiptRecognitionRequestSchema = z
  .object({
    imageBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
    mimeType: z.enum(['image/jpeg', 'image/png']),
  })
  .strict()

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
    total: z.number().int().finite().nonnegative().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    confidence: z.number().finite().min(0).max(1),
    rawText: z.string().max(MAX_RAW_TEXT_LENGTH).nullable(),
  })
  .strict()

export type ReceiptRecognitionRequest = z.infer<
  typeof ReceiptRecognitionRequestSchema
>
export type ReceiptRecognitionResponse = z.infer<
  typeof ReceiptRecognitionResponseSchema
>

export function parseRecognitionRequest(
  value: unknown,
): ReceiptRecognitionRequest {
  if (
    isRecord(value) &&
    typeof value.imageBase64 === 'string' &&
    value.imageBase64.length > MAX_BASE64_LENGTH
  )
    throw new OCRFunctionError('payload_too_large')
  const parsed = ReceiptRecognitionRequestSchema.safeParse(value)
  if (!parsed.success) throw new OCRFunctionError('invalid_image')
  return parsed.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
