import { z } from 'zod'
import type { ReceiptRecognitionResult } from '@domain/ports'
import { isDateOnly } from '@domain/value-objects'

export const MAX_RECEIPT_MERCHANT_LENGTH = 200
export const MAX_RECEIPT_RAW_TEXT_LENGTH = 20_000

export const ReceiptResultSchema = z
  .object({
    merchant: z.string().trim().max(MAX_RECEIPT_MERCHANT_LENGTH).nullable(),
    date: z
      .string()
      .refine(isDateOnly, 'La fecha OCR debe usar YYYY-MM-DD y ser válida.')
      .nullable(),
    total: z.number().int().finite().nonnegative().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    confidence: z.number().finite().min(0).max(1),
    rawText: z.string().max(MAX_RECEIPT_RAW_TEXT_LENGTH).nullable(),
  })
  .strict()

export class InvalidOCRResponseError extends Error {
  readonly code = 'invalid_ocr_response' as const

  constructor(options?: ErrorOptions) {
    super(
      'La respuesta del reconocimiento no tiene un formato válido.',
      options,
    )
    this.name = 'InvalidOCRResponseError'
  }
}

export function parseReceiptRecognitionResult(
  value: unknown,
): ReceiptRecognitionResult {
  const parsed = ReceiptResultSchema.safeParse(value)
  if (!parsed.success)
    throw new InvalidOCRResponseError({ cause: parsed.error })
  return parsed.data
}
