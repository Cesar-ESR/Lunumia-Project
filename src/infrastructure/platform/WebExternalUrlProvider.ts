import {
  type ExternalUrlProvider,
  validatedExternalUrl,
} from './ExternalUrlProvider'
import { NativePlatformError } from './NativePlatformError'

export class WebExternalUrlProvider implements ExternalUrlProvider {
  constructor(
    private readonly openWindow: typeof window.open = (...args) =>
      window.open(...args),
  ) {}

  async openExternalUrl(url: string): Promise<void> {
    const safeUrl = validatedExternalUrl(url)
    const opened = this.openWindow(safeUrl, '_blank', 'noopener,noreferrer')
    if (!opened) throw new NativePlatformError('external_url_failed')
    opened.opener = null
  }
}
