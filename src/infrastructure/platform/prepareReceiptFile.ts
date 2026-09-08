import { ReceiptImageError } from './ReceiptImageError'
import {
  MAX_RECEIPT_IMAGE_BYTES,
  validateReceiptImage,
} from './validateReceiptImage'

/** PDF is a local input format; the OCR contract remains JPEG/PNG. */
export async function prepareReceiptFile(file: File): Promise<File> {
  if (!file.size) throw new ReceiptImageError('empty_file')
  if (file.size >= MAX_RECEIPT_IMAGE_BYTES)
    throw new ReceiptImageError('file_too_large')
  const header = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new ReceiptImageError('read_failed'))
    reader.readAsText(file.slice(0, 5))
  })
  if (file.type !== 'application/pdf' && header !== '%PDF-') {
    validateReceiptImage(file)
    return file
  }
  if (header !== '%PDF-') throw new ReceiptImageError('pdf_invalid')
  const { renderReceiptPdf } = await import('./renderReceiptPdf')
  return renderReceiptPdf(file)
}
