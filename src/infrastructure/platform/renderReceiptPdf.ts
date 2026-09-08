import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ReceiptImageError } from './ReceiptImageError'

GlobalWorkerOptions.workerSrc = workerUrl

export async function renderReceiptPdf(file: File): Promise<File> {
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    stopAtErrors: true,
    useSystemFonts: true,
    verbosity: 0,
  })
  let canvas: HTMLCanvasElement | undefined
  try {
    const pdf = await task.promise
    if (pdf.numPages !== 1) throw new ReceiptImageError('pdf_page_limit')
    const page = await pdf.getPage(1)
    const original = page.getViewport({ scale: 1 })
    const scale = Math.min(3, 1920 / Math.max(original.width, original.height))
    const viewport = page.getViewport({ scale })
    if (
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    )
      throw new ReceiptImageError('pdf_invalid')
    canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport, background: 'white' }).promise
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(
        (value) =>
          value ? resolve(value) : reject(new ReceiptImageError('pdf_invalid')),
        'image/jpeg',
        0.92,
      )
    })
    return new File([blob], 'receipt-page.jpg', { type: 'image/jpeg' })
  } catch (reason) {
    if (reason instanceof ReceiptImageError) throw reason
    const name = reason instanceof Error ? reason.name : ''
    throw new ReceiptImageError(
      name === 'PasswordException' ? 'pdf_protected' : 'pdf_invalid',
    )
  } finally {
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    await task.destroy()
  }
}
