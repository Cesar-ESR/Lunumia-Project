import { describe, expect, it, vi } from 'vitest'
import { InvalidOCRResponseError } from '@application/contracts'
import {
  ConfigurableMockOCRProvider,
  type MockOCRScenarioName,
} from './ConfigurableMockOCRProvider'

describe('ConfigurableMockOCRProvider', () => {
  it.each([
    ['complete', 'Papelería Centro', 'MXN', 0.98],
    ['partial', 'Papelería Centro', null, 0.98],
    ['no_fields', null, null, 0],
    ['low_confidence', 'Papelería Centro', 'MXN', 0.2],
    ['currency_mismatch', 'Papelería Centro', 'USD', 0.98],
  ] as const)(
    'produce el escenario determinista %s',
    async (name, merchant, currency, confidence) => {
      const provider = new ConfigurableMockOCRProvider({ name })
      const result = await provider.recognize({
        imageBase64: 'sensitive-base64',
        mimeType: 'image/jpeg',
      })

      expect(result).toMatchObject({ merchant, currency, confidence })
      expect(provider.calls).toEqual([
        { order: 1, mimeType: 'image/jpeg', encodedLength: 16 },
      ])
      expect(JSON.stringify(provider.calls)).not.toContain('sensitive-base64')
      if (result.rawText)
        expect(JSON.stringify(provider.calls)).not.toContain(result.rawText)
    },
  )

  it.each([
    ['timeout', 'provider_timeout'],
    ['network_error', 'network_error'],
    ['rate_limited', 'rate_limited'],
    ['provider_unavailable', 'provider_unavailable'],
    ['unknown', 'unknown'],
  ] as const)(
    'rechaza %s con error OCR tipado y sanitizado',
    async (name, kind) => {
      const provider = new ConfigurableMockOCRProvider({ name })
      await expect(
        provider.recognize({ imageBase64: 'abc', mimeType: 'image/png' }),
      ).rejects.toMatchObject({ kind })
    },
  )

  it('representa una respuesta inválida sin fabricar un resultado no tipado', async () => {
    const provider = new ConfigurableMockOCRProvider({
      name: 'invalid_response',
    })
    await expect(
      provider.recognize({ imageBase64: 'abc', mimeType: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(InvalidOCRResponseError)
  })

  it('permite retraso determinista con temporizadores falsos y registra el orden', async () => {
    vi.useFakeTimers()
    try {
      const provider = new ConfigurableMockOCRProvider({
        name: 'complete',
        delayMs: 500,
      })
      const pending = provider.recognize({
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
      })
      expect(provider.callCount).toBe(1)
      await vi.advanceTimersByTimeAsync(500)
      await expect(pending).resolves.toMatchObject({ total: 12_345 })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('mantiene tipada la lista completa de escenarios', () => {
    const scenarios: MockOCRScenarioName[] = [
      'complete',
      'partial',
      'no_fields',
      'low_confidence',
      'currency_mismatch',
      'timeout',
      'network_error',
      'rate_limited',
      'provider_unavailable',
      'invalid_response',
      'unknown',
    ]
    expect(scenarios).toHaveLength(11)
  })
})
