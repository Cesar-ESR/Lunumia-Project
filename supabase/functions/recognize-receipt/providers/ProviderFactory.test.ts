import { describe, expect, it } from 'vitest'
import { ReceiptRecognitionResponseSchema } from '../schemas/contracts'
import { MockOCRProvider } from './MockOCRProvider'
import { createOCRProvider } from './ProviderFactory'

describe('proveedores OCR de recognize-receipt', () => {
  it('MockOCRProvider produce una respuesta válida y determinista', async () => {
    const provider = new MockOCRProvider()
    const input = {
      imageBytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      mimeType: 'image/jpeg' as const,
    }
    const first = await provider.recognize(input, new AbortController().signal)
    const second = await provider.recognize(input, new AbortController().signal)
    expect(first).toEqual(second)
    expect(ReceiptRecognitionResponseSchema.safeParse(first).success).toBe(true)
  })

  it('factory rechaza un proveedor desconocido', () => {
    expect(() =>
      createOCRProvider({
        provider: 'commercial-not-configured',
        runtimeEnvironment: 'local',
      }),
    ).toThrowError(expect.objectContaining({ code: 'provider_unavailable' }))
  })

  it('factory prohíbe el proveedor mock en producción', () => {
    expect(() =>
      createOCRProvider({ provider: 'mock', runtimeEnvironment: 'production' }),
    ).toThrowError(expect.objectContaining({ code: 'provider_unavailable' }))
  })
})
