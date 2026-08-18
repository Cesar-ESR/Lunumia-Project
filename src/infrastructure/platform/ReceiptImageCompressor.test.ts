import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import {
  createSelectedImageFixture,
  receiptDimensionFixtures,
} from '../../tests/receipt/receipt-test-fixtures'
import {
  calculateCompressedDimensions,
  RECEIPT_COMPRESSION_QUALITY,
  ReceiptImageCompressor,
  type ReceiptImageCompressorDependencies,
} from './ReceiptImageCompressor'
import {
  clearCapturedImage,
  type SelectedReceiptImage,
} from './PlatformAdapter'
import { ReceiptImageError } from './ReceiptImageError'

function selected(
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
): SelectedReceiptImage {
  return createSelectedImageFixture(mimeType)
}

function setup(width: number, height: number) {
  const decodedRelease = vi.fn()
  const canvasRelease = vi.fn()
  const revoke = vi.fn()
  const draw = vi.fn()
  const toBlob = vi.fn(
    async () => new Blob(['compressed'], { type: 'image/jpeg' }),
  )
  const source = document.createElement('canvas')
  const dependencies: ReceiptImageCompressorDependencies = {
    decoder: {
      decode: vi.fn(async () => ({
        source,
        width,
        height,
        release: decodedRelease,
      })),
    },
    canvases: {
      create: vi.fn(() => ({ draw, toBlob, release: canvasRelease })),
    },
    base64: { encode: vi.fn(async () => 'Y29tcHJlc3NlZA==') },
    objectUrls: { create: vi.fn(() => 'blob:preview'), revoke },
  }
  return {
    compressor: new ReceiptImageCompressor(dependencies),
    dependencies,
    draw,
    toBlob,
    decodedRelease,
    canvasRelease,
    revoke,
  }
}

describe('ReceiptImageCompressor', () => {
  it('no amplía una imagen menor de 1920 px y usa quality 0.8', async () => {
    const { compressor, dependencies, toBlob } = setup(800, 600)
    const result = await compressor.compress(selected())
    expect(result).toMatchObject({
      originalWidth: 800,
      originalHeight: 600,
      compressedWidth: 800,
      compressedHeight: 600,
      base64: 'Y29tcHJlc3NlZA==',
      previewUrl: 'blob:preview',
    })
    expect(dependencies.canvases.create).toHaveBeenCalledWith(800, 600)
    expect(toBlob).toHaveBeenCalledWith(
      'image/jpeg',
      RECEIPT_COMPRESSION_QUALITY,
    )
  })

  it('reduce una imagen horizontal conservando aspect ratio', async () => {
    const { compressor, dependencies } = setup(4000, 2000)
    const result = await compressor.compress(selected())
    expect(result).toMatchObject({
      compressedWidth: 1920,
      compressedHeight: 960,
    })
    expect(dependencies.canvases.create).toHaveBeenCalledWith(1920, 960)
  })

  it('reduce una imagen vertical sin superar 1920 px', async () => {
    const { compressor } = setup(2000, 4000)
    await expect(compressor.compress(selected())).resolves.toMatchObject({
      compressedWidth: 960,
      compressedHeight: 1920,
    })
  })

  it('libera decoder, canvas y preview temporal de forma idempotente', async () => {
    const { compressor, decodedRelease, canvasRelease, revoke } = setup(
      1200,
      900,
    )
    const result = await compressor.compress(selected())
    expect(decodedRelease).toHaveBeenCalledOnce()
    expect(canvasRelease).toHaveBeenCalledOnce()
    expect(clearCapturedImage(result)).toBeNull()
    result.revokePreviewUrl()
    expect(revoke).toHaveBeenCalledOnce()
  })

  it.each(receiptDimensionFixtures)(
    'acota $name ($width × $height) sin ampliar y conserva proporción',
    ({ width, height }) => {
      const result = calculateCompressedDimensions(width, height)
      expect(result.width).toBeLessThanOrEqual(1920)
      expect(result.height).toBeLessThanOrEqual(1920)
      expect(result.width).toBeLessThanOrEqual(width)
      expect(result.height).toBeLessThanOrEqual(height)
      if (result.width > 1 && result.height > 1)
        expect(result.width / result.height).toBeCloseTo(width / height, 2)
      else expect(Math.max(result.width, result.height)).toBe(1920)
    },
  )

  it('mantiene las invariantes de escalado para dimensiones positivas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (width, height) => {
          const result = calculateCompressedDimensions(width, height)
          expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(
            1920,
          )
          expect(result.width).toBeLessThanOrEqual(width)
          expect(result.height).toBeLessThanOrEqual(height)
        },
      ),
      { numRuns: 100 },
    )
  })

  it.each(['image/jpeg', 'image/png'] as const)(
    'conserva el contrato de salida para %s',
    async (mimeType) => {
      const { compressor, toBlob } = setup(1921, 1080)
      const result = await compressor.compress(selected(mimeType))
      expect(toBlob).toHaveBeenCalledWith(mimeType, RECEIPT_COMPRESSION_QUALITY)
      expect(result.mimeType).toBe(mimeType)
    },
  )

  it('traduce decode fallido y no crea canvas', async () => {
    const { compressor, dependencies } = setup(800, 600)
    vi.mocked(dependencies.decoder.decode).mockRejectedValueOnce(
      new ReceiptImageError('decode_failed'),
    )
    await expect(compressor.compress(selected())).rejects.toMatchObject({
      code: 'decode_failed',
    })
    expect(dependencies.canvases.create).not.toHaveBeenCalled()
  })

  it.each(['draw', 'export', 'empty_export'] as const)(
    'traduce fallo de canvas $case y libera referencias temporales',
    async (failure) => {
      const { compressor, draw, toBlob, decodedRelease, canvasRelease } = setup(
        800,
        600,
      )
      if (failure === 'draw')
        draw.mockImplementationOnce(() => {
          throw new Error('private pixels')
        })
      if (failure === 'export')
        toBlob.mockRejectedValueOnce(new Error('private pixels'))
      if (failure === 'empty_export')
        toBlob.mockResolvedValueOnce(new Blob([], { type: 'image/jpeg' }))

      await expect(compressor.compress(selected())).rejects.toMatchObject({
        code: 'compression_failed',
      })
      expect(decodedRelease).toHaveBeenCalledOnce()
      expect(canvasRelease).toHaveBeenCalledOnce()
    },
  )

  it('propaga read_failed del encoder y nunca registra base64', async () => {
    const { compressor, dependencies } = setup(800, 600)
    vi.mocked(dependencies.base64.encode).mockRejectedValueOnce(
      new ReceiptImageError('read_failed'),
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(compressor.compress(selected())).rejects.toMatchObject({
      code: 'read_failed',
    })
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('rechaza una compresión que excedería el request base64 de Groq', async () => {
    const { compressor, toBlob } = setup(1920, 1080)
    toBlob.mockResolvedValueOnce(
      new Blob([new Uint8Array(3_000_000)], { type: 'image/jpeg' }),
    )
    await expect(compressor.compress(selected())).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })
})
