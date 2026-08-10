import type { PlatformAdapter, SelectedReceiptImage } from './PlatformAdapter'
import { ReceiptImageError } from './ReceiptImageError'
import { validateReceiptImage } from './validateReceiptImage'

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
      input.accept = 'image/jpeg,image/png'
      input.multiple = false
      input.style.display = 'none'
      if (mode === 'camera') input.setAttribute('capture', 'environment')

      let settled = false
      let focusTimer: ReturnType<typeof setTimeout> | undefined

      const cleanup = () => {
        input.removeEventListener('change', handleChange)
        input.removeEventListener('cancel', handleCancel)
        window.removeEventListener('focus', handleWindowFocus)
        if (focusTimer !== undefined) clearTimeout(focusTimer)
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
      const handleChange = () => {
        try {
          const file = input.files?.item(0) ?? null
          if (!file) return finish(null)
          const mimeType = validateReceiptImage(file)
          finish({
            file,
            fileName: file.name,
            mimeType,
            originalSizeBytes: file.size,
          })
        } catch (reason) {
          fail(reason)
        }
      }
      const handleCancel = () => finish(null)
      const handleWindowFocus = () => {
        focusTimer = setTimeout(() => {
          if (!settled && !input.files?.length) finish(null)
        }, 0)
      }

      input.addEventListener('change', handleChange)
      input.addEventListener('cancel', handleCancel)
      window.addEventListener('focus', handleWindowFocus)
      document.body.append(input)
      try {
        input.click()
      } catch (reason) {
        fail(reason)
      }
    })
  }
}
