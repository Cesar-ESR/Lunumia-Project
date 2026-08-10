import {
  Camera,
  CameraDirection,
  CameraErrorCode,
  EncodingType,
  MediaType,
  MediaTypeSelection,
  type CameraPlugin,
  type MediaResult,
} from '@capacitor/camera'
import type { PlatformAdapter, SelectedReceiptImage } from './PlatformAdapter'
import { NativePlatformError } from './NativePlatformError'
import { ReceiptImageError } from './ReceiptImageError'
import { validateReceiptImage } from './validateReceiptImage'

type CameraPort = Pick<
  CameraPlugin,
  'checkPermissions' | 'requestPermissions' | 'takePhoto' | 'chooseFromGallery'
>

type LocalFetch = (input: RequestInfo | URL) => Promise<Response>

export class CapacitorPlatformAdapter implements PlatformAdapter {
  constructor(
    private readonly camera: CameraPort = Camera,
    private readonly fetchLocal: LocalFetch = (input) => fetch(input),
    private readonly now: () => number = Date.now,
  ) {}

  async takePhoto(): Promise<SelectedReceiptImage | null> {
    await this.ensureCameraPermission()
    try {
      const media = await this.camera.takePhoto({
        quality: 90,
        correctOrientation: true,
        encodingType: EncodingType.JPEG,
        saveToGallery: false,
        cameraDirection: CameraDirection.Rear,
        editable: 'no',
        includeMetadata: false,
      })
      return await this.normalize(media)
    } catch (reason) {
      if (isCancellation(reason, CameraErrorCode.TakePhotoCancelled))
        return null
      throw translateCameraFailure(reason, 'camera')
    }
  }

  async pickFromGallery(): Promise<SelectedReceiptImage | null> {
    try {
      const media = await this.camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        quality: 90,
        correctOrientation: true,
        editable: 'no',
        includeMetadata: false,
      })
      const selected = media.results[0]
      if (!selected) return null
      return await this.normalize(selected)
    } catch (reason) {
      if (isCancellation(reason, CameraErrorCode.ChooseMediaCancelled))
        return null
      throw translateCameraFailure(reason, 'gallery')
    }
  }

  private async ensureCameraPermission(): Promise<void> {
    let state: Awaited<ReturnType<CameraPort['checkPermissions']>>['camera']
    try {
      state = (await this.camera.checkPermissions()).camera
      if (state === 'prompt' || state === 'prompt-with-rationale')
        state = (
          await this.camera.requestPermissions({ permissions: ['camera'] })
        ).camera
    } catch (reason) {
      throw translateCameraFailure(reason, 'camera')
    }
    if (state !== 'granted' && state !== 'limited')
      throw new NativePlatformError('permission_denied')
  }

  private async normalize(media: MediaResult): Promise<SelectedReceiptImage> {
    if (media.type !== MediaType.Photo || !media.webPath)
      throw new NativePlatformError('invalid_image')
    try {
      const response = await this.fetchLocal(media.webPath)
      const blob = await response.blob()
      const mimeType = resolveMimeType(blob.type)
      const extension = mimeType === 'image/png' ? 'png' : 'jpg'
      const file = new File(
        [blob],
        `receipt-${this.now().toString()}.${extension}`,
        { type: mimeType },
      )
      const validatedMimeType = validateReceiptImage(file)
      return {
        file,
        fileName: file.name,
        mimeType: validatedMimeType,
        originalSizeBytes: file.size,
      }
    } catch (reason) {
      if (
        reason instanceof ReceiptImageError ||
        reason instanceof NativePlatformError
      )
        throw reason
      throw new NativePlatformError('invalid_image', {
        cause: reason instanceof Error ? reason : undefined,
      })
    }
  }
}

function resolveMimeType(blobType: string): 'image/jpeg' | 'image/png' {
  const normalizedType = blobType.toLowerCase().split(';', 1)[0]
  if (normalizedType === 'image/jpeg' || normalizedType === 'image/jpg')
    return 'image/jpeg'
  if (normalizedType === 'image/png') return 'image/png'

  throw new NativePlatformError('invalid_image')
}

function translateCameraFailure(
  reason: unknown,
  source: 'camera' | 'gallery',
): Error {
  if (
    reason instanceof NativePlatformError ||
    reason instanceof ReceiptImageError
  )
    return reason
  const code = getErrorCode(reason)
  if (code === CameraErrorCode.CameraPermissionDenied)
    return new NativePlatformError('permission_denied', errorCause(reason))
  if (code === CameraErrorCode.GalleryPermissionDenied)
    return new NativePlatformError('gallery_unavailable', errorCause(reason))
  if (code === CameraErrorCode.NoCameraAvailable)
    return new NativePlatformError('camera_unavailable', errorCause(reason))
  if (
    code === CameraErrorCode.InvalidImageData ||
    code === CameraErrorCode.ProcessImageFailed ||
    code === CameraErrorCode.FetchImageFromUriFailed
  )
    return new NativePlatformError('invalid_image', errorCause(reason))
  return new NativePlatformError(
    source === 'camera' ? 'camera_unavailable' : 'gallery_unavailable',
    errorCause(reason),
  )
}

function isCancellation(reason: unknown, expectedCode: CameraErrorCode) {
  return getErrorCode(reason) === expectedCode
}

function getErrorCode(reason: unknown): string | null {
  if (!reason || typeof reason !== 'object' || !('code' in reason)) return null
  return typeof reason.code === 'string' ? reason.code : null
}

function errorCause(reason: unknown): ErrorOptions | undefined {
  return reason instanceof Error ? { cause: reason } : undefined
}
