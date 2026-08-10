import { describe, expect, it, vi } from 'vitest'
import {
  EdgeFunctionOCRAdapter,
  type OCRFunctionsClient,
} from './EdgeFunctionOCRAdapter'
import { ReceiptRecognitionError } from './ReceiptRecognitionError'

const valid = {
  merchant: 'Comercio',
  date: '2026-08-02',
  total: 12_345,
  currency: 'MXN',
  confidence: 0.9,
  rawText: null,
}

function client(data: unknown, error: unknown = null): OCRFunctionsClient {
  return {
    functions: {
      invoke: vi.fn(async () => ({ data, error })),
    },
  }
}

function httpError(status: number, code: string) {
  return {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify({ code }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  }
}

const input = { imageBase64: '/9j/2Q==', mimeType: 'image/jpeg' as const }

describe('EdgeFunctionOCRAdapter', () => {
  it('invoca recognize-receipt y valida la respuesta', async () => {
    const functionsClient = client(valid)
    await expect(
      new EdgeFunctionOCRAdapter(functionsClient).recognize(input),
    ).resolves.toEqual(valid)
    expect(functionsClient.functions.invoke).toHaveBeenCalledWith(
      'recognize-receipt',
      {
        method: 'POST',
        body: input,
      },
    )
  })

  it('rechaza respuestas remotas sin validar', async () => {
    await expect(
      new EdgeFunctionOCRAdapter(client({ ...valid, total: 12.34 })).recognize(
        input,
      ),
    ).rejects.toMatchObject({ kind: 'invalid_provider_response' })
  })

  it('traduce timeout a error tipado y sanitizado', async () => {
    await expect(
      new EdgeFunctionOCRAdapter(
        client(null, httpError(504, 'provider_timeout')),
      ).recognize(input),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReceiptRecognitionError>>({
        kind: 'provider_timeout',
      }),
    )
  })

  it('traduce una sesión no autenticada', async () => {
    await expect(
      new EdgeFunctionOCRAdapter(
        client(null, httpError(401, 'unauthenticated')),
      ).recognize(input),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReceiptRecognitionError>>({
        kind: 'unauthenticated',
      }),
    )
  })

  it('no imprime base64, JWT ni respuesta OCR en consola', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await new EdgeFunctionOCRAdapter(client(valid)).recognize(input)
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('envía únicamente imagen y MIME mediante el cliente inyectado', async () => {
    const injected = client(valid)
    await new EdgeFunctionOCRAdapter(injected).recognize(input)
    const invoke = vi.mocked(injected.functions.invoke)
    expect(invoke).toHaveBeenCalledOnce()
    const body = invoke.mock.calls[0]?.[1].body
    expect(body).toEqual(input)
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('service_role')
    expect(body).not.toHaveProperty('apiKey')
  })

  it.each([
    [401, 'private-code', 'unauthenticated'],
    [413, 'private-code', 'payload_too_large'],
    [429, 'private-code', 'rate_limited'],
    [502, 'private-code', 'invalid_provider_response'],
    [503, 'private-code', 'provider_unavailable'],
    [504, 'private-code', 'provider_timeout'],
  ] as const)(
    'traduce HTTP %s a %s sin reintentar',
    async (status, code, kind) => {
      const functionsClient = client(null, httpError(status, code))
      await expect(
        new EdgeFunctionOCRAdapter(functionsClient).recognize(input),
      ).rejects.toMatchObject({ kind })
      expect(functionsClient.functions.invoke).toHaveBeenCalledOnce()
    },
  )

  it.each([
    [new TypeError('https://private.internal failed'), 'network_error'],
    [
      new DOMException('late private response', 'AbortError'),
      'provider_timeout',
    ],
    [new Error('provider stack and secret'), 'unknown'],
  ] as const)('sanea rechazos del cliente como %s', async (reason, kind) => {
    const functionsClient: OCRFunctionsClient = {
      functions: { invoke: vi.fn(async () => Promise.reject(reason)) },
    }
    const caught = await new EdgeFunctionOCRAdapter(functionsClient)
      .recognize(input)
      .catch((error: unknown) => error)
    expect(caught).toMatchObject({ kind })
    expect((caught as Error).message).not.toContain('private')
    expect(functionsClient.functions.invoke).toHaveBeenCalledOnce()
  })
})
