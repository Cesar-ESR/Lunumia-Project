import type { PlatformAdapter, SelectedReceiptImage } from './PlatformAdapter'
import { ReceiptImageError } from './ReceiptImageError'
import { validateReceiptImage } from './validateReceiptImage'
import { prepareReceiptFile } from './prepareReceiptFile'

type SelectionMode = 'camera' | 'gallery'

export class WebPlatformAdapter implements PlatformAdapter {
  takePhoto(): Promise<SelectedReceiptImage | null> {
    return this.openSelector('camera')
  }

  pickFromGallery(): Promise<SelectedReceiptImage | null> {
    return this.openSelector('gallery')
  }

  private openSelector(
    mode: SelectionMode,
  ): Promise<SelectedReceiptImage | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept =
        mode === 'camera'
          ? 'image/jpeg,image/png'
          : 'image/jpeg,image/png,application/pdf'
      input.multiple = false
      input.style.display = 'none'
      if (mode === 'camera') input.setAttribute('capture', 'environment')

      let settled = false

      const cleanup = () => {
        input.removeEventListener('change', handleChange)
        input.removeEventListener('cancel', handleCancel)
        input.remove()
      }
      const finish = (value: SelectedReceiptImage | null) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      }
      const fail = (reason: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        reject(
          reason instanceof ReceiptImageError
            ? reason
            : new ReceiptImageError('read_failed', { cause: reason }),
        )
      }
      const handleChange = async () => {
        try {
          const file = input.files?.item(0) ?? null
          if (!file) return finish(null)
          const prepared =
            mode === 'gallery' ? await prepareReceiptFile(file) : file
          const mimeType = validateReceiptImage(prepared)
          finish({
            file: prepared,
            fileName: file.name,
            mimeType,
            originalSizeBytes: file.size,
          })
        } catch (reason) {
          fail(reason)
        }
      }
      const handleCancel = () => finish(null)

      input.addEventListener('change', handleChange)
      input.addEventListener('cancel', handleCancel)
      document.body.append(input)
      try {
        input.click()
      } catch (reason) {
        fail(reason)
      }
    })
  }
}
