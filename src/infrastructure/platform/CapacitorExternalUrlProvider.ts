import { Browser, type BrowserPlugin } from '@capacitor/browser'
import {
  type ExternalUrlProvider,
  validatedExternalUrl,
} from './ExternalUrlProvider'
import { NativePlatformError } from './NativePlatformError'

export class CapacitorExternalUrlProvider implements ExternalUrlProvider {
  constructor(
    private readonly browser: Pick<BrowserPlugin, 'open'> = Browser,
  ) {}

  async openExternalUrl(url: string): Promise<void> {
    const safeUrl = validatedExternalUrl(url)
    try {
      await this.browser.open({ url: safeUrl })
    } catch (reason) {
      throw new NativePlatformError(
        'external_url_failed',
        reason instanceof Error ? { cause: reason } : undefined,
      )
    }
  }
}
