import { vi } from 'vitest'
import type { Period } from '@domain/entities'
import type { ReceiptRecognitionProvider } from '@domain/ports'
import type { CapturedImage, PlatformAdapter } from '@infrastructure/platform'
import { PrepareReceiptImage, RecognizeReceipt } from './receipt-workflow'

const selected = {
  file: new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }),
  fileName: 'receipt.jpg',
  mimeType: 'image/jpeg' as const,
  originalSizeBytes: 7,
}

const captured: CapturedImage = {
  fileName: 'receipt.jpg',
  mimeType: 'image/jpeg',
  originalSizeBytes: 7,
  originalWidth: 1000,
  originalHeight: 800,
  compressedWidth: 1000,
  compressedHeight: 800,
  base64: 'cmVjZWlwdA==',
  previewUrl: 'blob:receipt',
  revokePreviewUrl: vi.fn(),
}

const period: Period = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'owner',
  type: 'monthly',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'pending',
}

function captureSetup(selection: typeof selected | null = selected) {
  const platform: PlatformAdapter = {
    takePhoto: vi.fn().mockResolvedValue(selection),
    pickFromGallery: vi.fn().mockResolvedValue(selection),
  }
  const compressor = { compress: vi.fn().mockResolvedValue(captured) }
  return {
    useCase: new PrepareReceiptImage(platform, compressor),
    platform,
    compressor,
  }
}

describe('receipt workflow composition services', () => {
  it('usa la cámara y comprime una sola vez', async () => {
    const { useCase, platform, compressor } = captureSetup()
    await expect(useCase.execute('camera')).resolves.toBe(captured)
    expect(platform.takePhoto).toHaveBeenCalledOnce()
    expect(platform.pickFromGallery).not.toHaveBeenCalled()
    expect(compressor.compress).toHaveBeenCalledWith(selected)
  })

  it('usa la galería sin abrir la cámara', async () => {
    const { useCase, platform } = captureSetup()
    await useCase.execute('gallery')
    expect(platform.pickFromGallery).toHaveBeenCalledOnce()
    expect(platform.takePhoto).not.toHaveBeenCalled()
  })

  it('trata la cancelación como null y no comprime', async () => {
    const { useCase, compressor } = captureSetup(null)
    await expect(useCase.execute('camera')).resolves.toBeNull()
    expect(compressor.compress).not.toHaveBeenCalled()
  })

  it('envía solo base64/MIME al proveedor y devuelve el borrador', async () => {
    const recognize = vi.fn().mockResolvedValue({
      merchant: 'Mercado',
      date: '2026-07-04',
      subtotal: 10_000,
      tax: 2_345,
      tip: null,
      discount: null,
      otherFees: null,
      total: 12345,
      amountPaid: 12_345,
      amountEvidence: 'TOTAL 123.45',
      amountAmbiguous: false,
      currency: 'MXN',
      confidence: 0.9,
      rawText: 'texto que no debe llegar al formulario',
    })
    const provider: ReceiptRecognitionProvider = { recognize }
    const proposal = await new RecognizeReceipt(provider).execute(
      captured,
      [period],
      period.id,
    )
    expect(recognize).toHaveBeenCalledWith({
      imageBase64: captured.base64,
      mimeType: captured.mimeType,
    })
    expect(proposal.draft.amount).toBe(12345)
    expect(proposal).not.toHaveProperty('rawText')
  })

  it('falla de forma tipada cuando no existe proveedor configurado', async () => {
    await expect(
      new RecognizeReceipt(null).execute(captured, [period], period.id),
    ).rejects.toMatchObject({ kind: 'provider_unavailable' })
  })
})
