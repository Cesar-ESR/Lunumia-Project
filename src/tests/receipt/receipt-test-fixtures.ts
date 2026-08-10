import type { SupportedReceiptMimeType } from '@domain/ports'
import { MAX_RECEIPT_IMAGE_BYTES } from '@infrastructure/platform'

const jpegSignature = new Uint8Array([0xff, 0xd8, 0xff, 0xdb])
const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export interface ReceiptFileFixtureOptions {
  name?: string
  mimeType?: string
  sizeBytes?: number
  bytes?: Uint8Array
}

/**
 * Creates a tiny in-memory File while allowing tests to simulate size metadata.
 * No large binary fixture is written to disk or retained.
 */
export function createReceiptFileFixture({
  name = 'receipt.jpg',
  mimeType = 'image/jpeg',
  sizeBytes,
  bytes = mimeType === 'image/png' ? pngSignature : jpegSignature,
}: ReceiptFileFixtureOptions = {}): File {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  const file = new File([binary], name, { type: mimeType })
  if (sizeBytes !== undefined)
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: sizeBytes,
    })
  return file
}

export const receiptFileFixtures = {
  jpeg: () => createReceiptFileFixture(),
  png: () =>
    createReceiptFileFixture({ name: 'receipt.png', mimeType: 'image/png' }),
  empty: () => createReceiptFileFixture({ bytes: new Uint8Array() }),
  invalidMime: (mimeType = 'application/pdf', name = 'receipt.jpg') =>
    createReceiptFileFixture({ mimeType, name }),
  belowLimit: () =>
    createReceiptFileFixture({ sizeBytes: MAX_RECEIPT_IMAGE_BYTES - 1 }),
  atLimit: () =>
    createReceiptFileFixture({ sizeBytes: MAX_RECEIPT_IMAGE_BYTES }),
  aboveLimit: () =>
    createReceiptFileFixture({ sizeBytes: MAX_RECEIPT_IMAGE_BYTES + 1 }),
} as const

export interface ReceiptDimensionFixture {
  name: string
  width: number
  height: number
}

export const receiptDimensionFixtures = [
  { name: 'boundary', width: 1920, height: 1080 },
  { name: 'wide', width: 1921, height: 1080 },
  { name: 'tall', width: 1080, height: 1921 },
  { name: 'landscape', width: 4000, height: 3000 },
  { name: 'portrait', width: 3000, height: 4000 },
  { name: 'small', width: 800, height: 600 },
  { name: 'extreme', width: 1_000_000, height: 1 },
] as const satisfies readonly ReceiptDimensionFixture[]

export function createSelectedImageFixture(
  mimeType: SupportedReceiptMimeType = 'image/jpeg',
) {
  const file = createReceiptFileFixture({
    name: mimeType === 'image/jpeg' ? 'receipt.jpg' : 'receipt.png',
    mimeType,
  })
  return {
    file,
    fileName: file.name,
    mimeType,
    originalSizeBytes: file.size,
  }
}
