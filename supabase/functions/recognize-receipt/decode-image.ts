import { OCRFunctionError } from './errors/OCRFunctionError.ts'
import { MAX_RECEIPT_BYTES } from './schemas/contracts.ts'
import type { OCRProviderMimeType } from './providers/OCRProvider.ts'

export function decodeReceiptImage(
  imageBase64: string,
  mimeType: OCRProviderMimeType,
): Uint8Array {
  if (
    imageBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)
  )
    throw new OCRFunctionError('invalid_image')
  let binary: string
  try {
    binary = atob(imageBase64)
  } catch {
    throw new OCRFunctionError('invalid_image')
  }
  if (binary.length === 0) throw new OCRFunctionError('invalid_image')
  if (binary.length >= MAX_RECEIPT_BYTES)
    throw new OCRFunctionError('payload_too_large')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (!matchesSignature(bytes, mimeType))
    throw new OCRFunctionError('invalid_image')
  return bytes
}

function matchesSignature(
  bytes: Uint8Array,
  mimeType: OCRProviderMimeType,
): boolean {
  if (mimeType === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return signature.every((value, index) => bytes[index] === value)
}
