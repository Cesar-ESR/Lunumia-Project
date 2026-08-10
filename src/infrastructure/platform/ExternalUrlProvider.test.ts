import { describe, expect, it, vi } from 'vitest'
import { CapacitorExternalUrlProvider } from './CapacitorExternalUrlProvider'
import { NativePlatformError } from './NativePlatformError'
import { WebExternalUrlProvider } from './WebExternalUrlProvider'

describe('external URL providers', () => {
  it('Android abre únicamente una URL HTTPS validada con Browser', async () => {
    const browser = { open: vi.fn(async () => undefined) }
    await new CapacitorExternalUrlProvider(browser).openExternalUrl(
      'https://example.com/help?q=1',
    )
    expect(browser.open).toHaveBeenCalledWith({
      url: 'https://example.com/help?q=1',
    })
  })

  it.each(['javascript:alert(1)', 'data:text/html,test', 'http://example.com'])(
    'rechaza el esquema peligroso o no cifrado %s',
    async (url) => {
      const browser = { open: vi.fn(async () => undefined) }
      await expect(
        new CapacitorExternalUrlProvider(browser).openExternalUrl(url),
      ).rejects.toBeInstanceOf(NativePlatformError)
      expect(browser.open).not.toHaveBeenCalled()
    },
  )

  it('web conserva window.open con aislamiento de opener', async () => {
    window.opener = window
    const openWindow = vi.fn<typeof window.open>(() => window)
    await new WebExternalUrlProvider(openWindow).openExternalUrl(
      'https://example.com/',
    )
    expect(openWindow).toHaveBeenCalledWith(
      'https://example.com/',
      '_blank',
      'noopener,noreferrer',
    )
    expect(window.opener).toBeNull()
  })
})
