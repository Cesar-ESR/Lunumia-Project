import type { SupportedReceiptMimeType } from '@domain/ports'
import type { CapturedImage, SelectedReceiptImage } from './PlatformAdapter'
import { ReceiptImageError } from './ReceiptImageError'
import {
  MAX_RECEIPT_OCR_IMAGE_BYTES,
  validateReceiptImage,
} from './validateReceiptImage'

export const MAX_RECEIPT_IMAGE_DIMENSION = 1920
export const RECEIPT_COMPRESSION_QUALITY = 0.8

export interface DecodedReceiptImage {
  source: CanvasImageSource
  width: number
  height: number
  release(): void
}

export interface ReceiptImageDecoder {
  decode(file: File): Promise<DecodedReceiptImage>
}

export interface ReceiptCanvasSurface {
  draw(source: CanvasImageSource, width: number, height: number): void
  toBlob(mimeType: SupportedReceiptMimeType, quality: number): Promise<Blob>
  release(): void
}

export interface ReceiptCanvasFactory {
  create(width: number, height: number): ReceiptCanvasSurface
}

export interface ReceiptBase64Encoder {
  encode(blob: Blob): Promise<string>
}

export interface ReceiptObjectUrlFactory {
  create(blob: Blob): string
  revoke(url: string): void
}

export interface ReceiptImageCompressorDependencies {
  decoder: ReceiptImageDecoder
  canvases: ReceiptCanvasFactory
  base64: ReceiptBase64Encoder
  objectUrls: ReceiptObjectUrlFactory
}

export interface ReceiptImageDimensions {
  width: number
  height: number
}

export function calculateCompressedDimensions(
  width: number,
  height: number,
  maximum = MAX_RECEIPT_IMAGE_DIMENSION,
): ReceiptImageDimensions {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new ReceiptImageError('decode_failed')
  const scale = Math.min(1, maximum / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export class ReceiptImageCompressor {
  constructor(
    private readonly dependencies: ReceiptImageCompressorDependencies = browserReceiptImageDependencies(),
  ) {}

  async compress(image: SelectedReceiptImage): Promise<CapturedImage> {
    const mimeType = validateReceiptImage(image.file)
    let decoded: DecodedReceiptImage | undefined
    let canvas: ReceiptCanvasSurface | undefined
    try {
      decoded = await this.dependencies.decoder.decode(image.file)
      const dimensions = calculateCompressedDimensions(
        decoded.width,
        decoded.height,
      )
      canvas = this.dependencies.canvases.create(
        dimensions.width,
        dimensions.height,
      )
      canvas.draw(decoded.source, dimensions.width, dimensions.height)
      const blob = await canvas.toBlob(mimeType, RECEIPT_COMPRESSION_QUALITY)
      if (blob.size === 0) throw new ReceiptImageError('compression_failed')
      if (blob.size >= MAX_RECEIPT_OCR_IMAGE_BYTES)
        throw new ReceiptImageError('file_too_large')
      const base64 = await this.dependencies.base64.encode(blob)
      const previewUrl = this.dependencies.objectUrls.create(blob)
      let previewActive = true
      return {
        fileName: image.fileName,
        mimeType,
        originalSizeBytes: image.originalSizeBytes,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        compressedWidth: dimensions.width,
        compressedHeight: dimensions.height,
        base64,
        previewUrl,
        revokePreviewUrl: () => {
          if (!previewActive) return
          previewActive = false
          this.dependencies.objectUrls.revoke(previewUrl)
        },
      }
    } catch (reason) {
      if (reason instanceof ReceiptImageError) throw reason
      throw new ReceiptImageError('compression_failed', { cause: reason })
    } finally {
      canvas?.release()
      decoded?.release()
    }
  }
}

class BrowserReceiptImageDecoder implements ReceiptImageDecoder {
  async decode(file: File): Promise<DecodedReceiptImage> {
    if (typeof globalThis.createImageBitmap === 'function') {
      try {
        const bitmap = await globalThis.createImageBitmap(file, {
          imageOrientation: 'from-image',
        })
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        }
      } catch (reason) {
        throw new ReceiptImageError('decode_failed', { cause: reason })
      }
    }
    return decodeWithImageElement(file)
  }
}

function decodeWithImageElement(file: File): Promise<DecodedReceiptImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    let released = false
    const release = () => {
      if (released) return
      released = true
      URL.revokeObjectURL(url)
      image.src = ''
    }
    image.onload = () => {
      image.onload = null
      image.onerror = null
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release,
      })
    }
    image.onerror = (event) => {
      image.onload = null
      image.onerror = null
      release()
      reject(new ReceiptImageError('decode_failed', { cause: event }))
    }
    image.src = url
  })
}

class BrowserReceiptCanvasFactory implements ReceiptCanvasFactory {
  create(width: number, height: number): ReceiptCanvasSurface {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ReceiptImageError('compression_failed')
    return {
      draw: (source, drawWidth, drawHeight) => {
        context.drawImage(source, 0, 0, drawWidth, drawHeight)
      },
      toBlob: (mimeType, quality) =>
        new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new ReceiptImageError('compression_failed')),
            mimeType,
            quality,
          )
        }),
      release: () => {
        canvas.width = 0
        canvas.height = 0
      },
    }
  }
}

class BrowserReceiptBase64Encoder implements ReceiptBase64Encoder {
  async encode(blob: Blob): Promise<string> {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const chunks: string[] = []
      const chunkSize = 0x8000
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        chunks.push(
          String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
        )
      }
      return btoa(chunks.join(''))
    } catch (reason) {
      throw new ReceiptImageError('read_failed', { cause: reason })
    }
  }
}

function browserReceiptImageDependencies(): ReceiptImageCompressorDependencies {
  return {
    decoder: new BrowserReceiptImageDecoder(),
    canvases: new BrowserReceiptCanvasFactory(),
    base64: new BrowserReceiptBase64Encoder(),
    objectUrls: {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => URL.revokeObjectURL(url),
    },
  }
}
