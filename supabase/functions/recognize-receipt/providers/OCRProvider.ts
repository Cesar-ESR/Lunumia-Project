import type { ReceiptRecognitionResponse } from '../schemas/contracts.ts'

export type OCRProviderMimeType = 'image/jpeg' | 'image/png'

export interface OCRProviderInput {
  imageBytes: Uint8Array
  mimeType: OCRProviderMimeType
}

export interface OCRProvider {
  recognize(
    input: OCRProviderInput,
    signal: AbortSignal,
  ): Promise<ReceiptRecognitionResponse>
}
