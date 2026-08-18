import type { SupportedReceiptMimeType } from '@domain/ports'
import { ReceiptImageError } from './ReceiptImageError'

export const MAX_RECEIPT_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_RECEIPT_OCR_IMAGE_BYTES = 3_000_000
export const SUPPORTED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
] as const satisfies readonly SupportedReceiptMimeType[]

export function isSupportedReceiptMimeType(
  value: string,
): value is SupportedReceiptMimeType {
  return SUPPORTED_RECEIPT_MIME_TYPES.some((mimeType) => mimeType === value)
}

export function validateReceiptImage(file: File): SupportedReceiptMimeType {
  if (file.size === 0) throw new ReceiptImageError('empty_file')
  if (file.size >= MAX_RECEIPT_IMAGE_BYTES)
    throw new ReceiptImageError('file_too_large')
  if (!isSupportedReceiptMimeType(file.type))
    throw new ReceiptImageError('unsupported_type')
  return file.type
}
