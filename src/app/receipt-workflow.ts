import { mapReceiptToExpenseDraft } from '@application/use-cases/receipts'
import type { Period } from '@domain/entities'
import type { ReceiptRecognitionProvider } from '@domain/ports'
import { ReceiptRecognitionError } from '@infrastructure/ocr'
import type {
  CapturedImage,
  PlatformAdapter,
  ReceiptImageCompressor,
} from '@infrastructure/platform'

export type ReceiptImageSource = 'camera' | 'gallery'

export class PrepareReceiptImage {
  constructor(
    private readonly platform: PlatformAdapter,
    private readonly compressor: Pick<ReceiptImageCompressor, 'compress'>,
  ) {}

  async execute(source: ReceiptImageSource): Promise<CapturedImage | null> {
    const selected =
      source === 'camera'
        ? await this.platform.takePhoto()
        : await this.platform.pickFromGallery()
    return selected ? this.compressor.compress(selected) : null
  }
}

export class RecognizeReceipt {
  constructor(private readonly provider: ReceiptRecognitionProvider | null) {}

  async execute(
    image: CapturedImage,
    periods: Period[],
    activePeriodId: string | null,
  ) {
    if (!this.provider)
      throw new ReceiptRecognitionError('provider_unavailable')
    const result = await this.provider.recognize({
      imageBase64: image.base64,
      mimeType: image.mimeType,
    })
    return mapReceiptToExpenseDraft(result, periods, activePeriodId)
  }
}
