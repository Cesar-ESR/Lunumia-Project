import { NativePlatformError } from './NativePlatformError'

export interface ExternalUrlProvider {
  openExternalUrl(url: string): Promise<void>
}

export function validatedExternalUrl(value: string): string {
  if (value.length > 2_048) throw new NativePlatformError('external_url_failed')
  let url: URL
  try {
    url = new URL(value)
  } catch (reason) {
    throw new NativePlatformError(
      'external_url_failed',
      reason instanceof Error ? { cause: reason } : undefined,
    )
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '')
    throw new NativePlatformError('external_url_failed')
  return url.href
}
