import type { SupportedReceiptMimeType } from '@domain/ports'

export interface SelectedReceiptImage {
  file: File
  fileName: string
  mimeType: SupportedReceiptMimeType
  originalSizeBytes: number
}

export interface CapturedImage {
  fileName: string
  mimeType: SupportedReceiptMimeType
  originalSizeBytes: number
  originalWidth: number
  originalHeight: number
  compressedWidth: number
  compressedHeight: number
  /** Base64 puro, sin prefijo data URL. */
  base64: string
  previewUrl: string
  revokePreviewUrl(): void
}

export interface PlatformAdapter {
  takePhoto(): Promise<SelectedReceiptImage | null>
  pickFromGallery(): Promise<SelectedReceiptImage | null>
}

export function clearCapturedImage(_image: CapturedImage | null): null {
  _image?.revokePreviewUrl()
  return null
}
