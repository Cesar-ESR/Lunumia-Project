import { describe, expect, it, vi } from 'vitest'
import {
  CameraDirection,
  CameraErrorCode,
  EncodingType,
  MediaType,
  MediaTypeSelection,
} from '@capacitor/camera'
import {
  PrepareReceiptImage,
  RecognizeReceipt,
} from '../../app/receipt-workflow'
import { CapacitorPlatformAdapter } from './CapacitorPlatformAdapter'
import { NativePlatformError } from './NativePlatformError'

const jpegMedia = {
  type: MediaType.Photo,
  saved: false,
  webPath: 'capacitor://localhost/_capacitor_file_/receipt.jpg',
  metadata: { format: 'jpg' },
}

function setup(permission: 'granted' | 'denied' | 'prompt' = 'granted') {
  const camera = {
    checkPermissions: vi.fn(async () => ({
      camera: permission,
      photos: 'granted' as const,
    })),
    requestPermissions: vi.fn(async () => ({
      camera: 'granted' as const,
      photos: 'granted' as const,
    })),
    takePhoto: vi.fn(async () => jpegMedia),
    chooseFromGallery: vi.fn(async () => ({ results: [jpegMedia] })),
  }
  const fetchLocal = vi.fn(
    async () =>
      new Response('receipt', {
        headers: { 'content-type': 'image/jpeg' },
      }),
  )
  return {
    adapter: new CapacitorPlatformAdapter(camera, fetchLocal, () => 123),
    camera,
    fetchLocal,
  }
}

describe('CapacitorPlatformAdapter', () => {
  it('captura con cámara trasera y normaliza webPath a un File temporal', async () => {
    const { adapter, camera, fetchLocal } = setup()
    const selected = await adapter.takePhoto()
    expect(camera.takePhoto).toHaveBeenCalledWith({
      quality: 90,
      correctOrientation: true,
      encodingType: EncodingType.JPEG,
      saveToGallery: false,
      cameraDirection: CameraDirection.Rear,
      editable: 'no',
      includeMetadata: false,
    })
    expect(fetchLocal).toHaveBeenCalledWith(jpegMedia.webPath)
    expect(selected).toMatchObject({
      fileName: 'receipt-123.jpg',
      mimeType: 'image/jpeg',
    })
    expect(selected?.file).toBeInstanceOf(File)
    expect(selected?.originalSizeBytes).toBe(selected?.file.size)
    expect(selected?.originalSizeBytes).toBeGreaterThan(0)
    expect(selected).not.toHaveProperty('base64')
    expect(selected).not.toHaveProperty('webPath')
  })

  it('solicita permiso únicamente cuando está pendiente', async () => {
    const { adapter, camera } = setup('prompt')
    await adapter.takePhoto()
    expect(camera.requestPermissions).toHaveBeenCalledWith({
      permissions: ['camera'],
    })
  })

  it('permiso denegado produce error tipado y no abre la cámara', async () => {
    const { adapter, camera } = setup('denied')
    await expect(adapter.takePhoto()).rejects.toMatchObject({
      code: 'permission_denied',
      message:
        'No tenemos permiso para usar la cámara. Puedes elegir una imagen de tu galería o registrar el gasto manualmente.',
    })
    expect(camera.requestPermissions).not.toHaveBeenCalled()
    expect(camera.takePhoto).not.toHaveBeenCalled()
  })

  it('cancelar cámara devuelve null sin exponer un error', async () => {
    const { adapter, camera, fetchLocal } = setup()
    camera.takePhoto.mockRejectedValue({
      code: CameraErrorCode.TakePhotoCancelled,
    })
    await expect(adapter.takePhoto()).resolves.toBeNull()
    expect(fetchLocal).not.toHaveBeenCalled()
  })

  it('galería selecciona una sola fotografía con la API vigente', async () => {
    const { adapter, camera } = setup()
    await expect(adapter.pickFromGallery()).resolves.toMatchObject({
      mimeType: 'image/jpeg',
    })
    expect(camera.chooseFromGallery).toHaveBeenCalledWith({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      quality: 90,
      correctOrientation: true,
      editable: 'no',
      includeMetadata: false,
    })
  })

  it('cancelar galería devuelve null', async () => {
    const { adapter, camera } = setup()
    camera.chooseFromGallery.mockRejectedValue({
      code: CameraErrorCode.ChooseMediaCancelled,
    })
    await expect(adapter.pickFromGallery()).resolves.toBeNull()
  })

  it('rechaza resultados que no sean imágenes JPEG/PNG', async () => {
    const { adapter, camera } = setup()
    camera.chooseFromGallery.mockResolvedValue({
      results: [
        {
          ...jpegMedia,
          type: MediaType.Video,
          metadata: { format: 'mp4' },
        },
      ],
    })
    await expect(adapter.pickFromGallery()).rejects.toBeInstanceOf(
      NativePlatformError,
    )
  })

  it('reutiliza el mismo compresor del flujo web antes de OCR', async () => {
    const { adapter } = setup()
    const compressed = {
      fileName: 'receipt.jpg',
      mimeType: 'image/jpeg' as const,
      originalSizeBytes: 7,
      originalWidth: 10,
      originalHeight: 10,
      compressedWidth: 10,
      compressedHeight: 10,
      base64: 'cmVjZWlwdA==',
      previewUrl: 'blob:receipt',
      revokePreviewUrl: vi.fn(),
    }
    const compressor = { compress: vi.fn(async () => compressed) }
    const result = await new PrepareReceiptImage(adapter, compressor).execute(
      'camera',
    )
    expect(compressor.compress).toHaveBeenCalledOnce()
    expect(result).toBe(compressed)
  })

  it('atraviesa el OCR común sin crear ni persistir un Expense', async () => {
    const { adapter } = setup()
    const compressed = {
      fileName: 'receipt.jpg',
      mimeType: 'image/jpeg' as const,
      originalSizeBytes: 7,
      originalWidth: 10,
      originalHeight: 10,
      compressedWidth: 10,
      compressedHeight: 10,
      base64: 'cmVjZWlwdA==',
      previewUrl: 'blob:receipt',
      revokePreviewUrl: vi.fn(),
    }
    const image = await new PrepareReceiptImage(adapter, {
      compress: vi.fn(async () => compressed),
    }).execute('camera')
    const recognize = vi.fn(async () => ({
      merchant: 'Mercado',
      date: '2026-08-08',
      total: 12_345,
      currency: 'MXN',
      confidence: 0.9,
      rawText: 'texto efímero',
    }))
    if (!image) throw new Error('La cámara simulada debía devolver una imagen.')
    const proposal = await new RecognizeReceipt({ recognize }).execute(
      image,
      [],
      null,
    )
    expect(recognize).toHaveBeenCalledOnce()
    expect(recognize).toHaveBeenCalledWith({
      imageBase64: compressed.base64,
      mimeType: compressed.mimeType,
    })
    expect(proposal.draft).toMatchObject({
      description: 'Mercado',
      amount: 12_345,
      date: '2026-08-08',
    })
    expect(proposal).not.toHaveProperty('expense')
    expect(proposal).not.toHaveProperty('rawText')
  })
})
