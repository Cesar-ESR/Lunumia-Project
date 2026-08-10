import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRecognizeReceiptHandler,
  type RecognizeReceiptDependencies,
} from './handler'
import type { OCRProvider } from './providers/OCRProvider'
import { OCRFunctionError } from './errors/OCRFunctionError'
import { MAX_BASE64_LENGTH } from './schemas/contracts'
import { RateLimitStorageError } from '../_shared/distributed-rate-limiter'

const origin = 'https://lunumia.example'
const jpegBase64 = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9))
const pngBase64 = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
)
const validResult = {
  merchant: 'Comercio de prueba',
  date: '2026-01-15',
  total: 12_345,
  currency: 'MXN',
  confidence: 0.99,
  rawText: 'MOCK RECEIPT',
}

function provider(): OCRProvider {
  return { recognize: vi.fn(async () => validResult) }
}

function dependencies(overrides: Partial<RecognizeReceiptDependencies> = {}) {
  const base: RecognizeReceiptDependencies = {
    allowedOrigins: [origin, 'http://localhost:5173'],
    timeoutMs: 30_000,
    rateLimiter: {
      consume: vi.fn(async () => ({
        allowed: true,
        remaining: 4,
        resetAt: Date.now() + 60_000,
      })),
    },
    verifyToken: vi.fn(async (token) =>
      token === 'valid-token' ? { userId: 'user-id' } : null,
    ),
    createProvider: vi.fn(provider),
  }
  return { ...base, ...overrides }
}

function request(
  body: object = {
    imageBase64: jpegBase64,
    mimeType: 'image/jpeg',
  },
  token = 'valid-token',
) {
  return new Request('https://functions.example/recognize-receipt', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('recognize-receipt Edge Function', () => {
  it('exige autenticación y no ejecuta el proveedor sin usuario', async () => {
    const deps = dependencies()
    const response = await createRecognizeReceiptHandler(deps)(request({}, ''))
    expect(response.status).toBe(401)
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it('valida JPEG real, ejecuta OCR y devuelve resultado estructurado', async () => {
    const response =
      await createRecognizeReceiptHandler(dependencies())(request())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(validResult)
  })

  it('limita OCR antes de leer la imagen o ejecutar el proveedor', async () => {
    const deps = dependencies({
      rateLimiter: {
        consume: vi.fn(async () => ({
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60_000,
        })),
      },
    })
    const response = await createRecognizeReceiptHandler(deps)(request())
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it('falla cerrado si no puede persistir el límite de OCR', async () => {
    const deps = dependencies({
      rateLimiter: {
        consume: vi.fn(async () => {
          throw new RateLimitStorageError()
        }),
      },
    })
    const response = await createRecognizeReceiptHandler(deps)(request())
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'rate_limit_unavailable',
    })
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it('rechaza MIME que no coincide con la firma binaria', async () => {
    const response = await createRecognizeReceiptHandler(dependencies())(
      request({ imageBase64: jpegBase64, mimeType: 'image/png' }),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_image',
    })
  })

  it('rechaza userId y metadatos arbitrarios por esquema estricto', async () => {
    const response = await createRecognizeReceiptHandler(dependencies())(
      request({
        imageBase64: jpegBase64,
        mimeType: 'image/jpeg',
        userId: 'otro-usuario',
      }),
    )
    expect(response.status).toBe(400)
  })

  it('corta al proveedor cuando supera el timeout', async () => {
    vi.useFakeTimers()
    const never: OCRProvider = {
      recognize: vi.fn(() => new Promise(() => undefined)),
    }
    const responsePromise = createRecognizeReceiptHandler(
      dependencies({ timeoutMs: 5, createProvider: () => never }),
    )(request())
    await vi.advanceTimersByTimeAsync(5)
    const response = await responsePromise
    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toMatchObject({
      code: 'provider_timeout',
    })
  })

  it('maneja OPTIONS únicamente para orígenes permitidos', async () => {
    const preflight = new Request(
      'https://functions.example/recognize-receipt',
      { method: 'OPTIONS', headers: { Origin: origin } },
    )
    const response =
      await createRecognizeReceiptHandler(dependencies())(preflight)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  })

  it('no registra JWT, base64 ni texto OCR', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await createRecognizeReceiptHandler(dependencies())(request())
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it.each(['GET', 'PUT'] as const)(
    'rechaza %s con método estable y sin ejecutar auth/proveedor',
    async (method) => {
      const deps = dependencies()
      const response = await createRecognizeReceiptHandler(deps)(
        new Request('https://functions.example/recognize-receipt', {
          method,
          headers: { Origin: origin },
        }),
      )
      expect(response.status).toBe(405)
      await expect(response.json()).resolves.toEqual({
        code: 'unknown',
        message: 'No fue posible reconocer el recibo.',
      })
      expect(deps.verifyToken).not.toHaveBeenCalled()
      expect(deps.createProvider).not.toHaveBeenCalled()
    },
  )

  it('rechaza origen CORS no permitido antes de autenticar', async () => {
    const deps = dependencies()
    const response = await createRecognizeReceiptHandler(deps)(
      new Request('https://functions.example/recognize-receipt', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
    )
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(deps.verifyToken).not.toHaveBeenCalled()
  })

  it('acepta PNG firmado y obtiene la identidad exclusivamente del token', async () => {
    const deps = dependencies()
    const response = await createRecognizeReceiptHandler(deps)(
      request({ imageBase64: pngBase64, mimeType: 'image/png' }),
    )
    expect(response.status).toBe(200)
    expect(deps.verifyToken).toHaveBeenCalledOnce()
    expect(deps.verifyToken).toHaveBeenCalledWith('valid-token')
    const createdProvider = vi.mocked(deps.createProvider).mock.results[0]
      ?.value
    expect(createdProvider?.recognize).toHaveBeenCalledOnce()
    expect(createdProvider?.recognize).toHaveBeenCalledWith(
      { imageBytes: expect.any(Uint8Array), mimeType: 'image/png' },
      expect.any(AbortSignal),
    )
  })

  it.each([
    [
      'MIME inválido',
      { imageBase64: jpegBase64, mimeType: 'image/webp' },
      400,
      'invalid_image',
    ],
    [
      'base64 vacío',
      { imageBase64: '', mimeType: 'image/jpeg' },
      400,
      'invalid_image',
    ],
    [
      'base64 inválido',
      { imageBase64: 'not-base64!', mimeType: 'image/jpeg' },
      400,
      'invalid_image',
    ],
    ['campo faltante', { imageBase64: jpegBase64 }, 400, 'invalid_image'],
    [
      'campo inesperado',
      { imageBase64: jpegBase64, mimeType: 'image/jpeg', extra: true },
      400,
      'invalid_image',
    ],
  ] as const)('rechaza payload: %s', async (_label, body, status, code) => {
    const deps = dependencies()
    const response = await createRecognizeReceiptHandler(deps)(request(body))
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toMatchObject({ code })
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it('rechaza JSON inválido sin devolver detalles del parser', async () => {
    const response = await createRecognizeReceiptHandler(dependencies())(
      new Request('https://functions.example/recognize-receipt', {
        method: 'POST',
        headers: {
          Origin: origin,
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: '{private invalid json',
      }),
    )
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('invalid_image')
    expect(text).not.toContain('private invalid json')
  })

  it('rechaza payload sobre el límite antes de crear proveedor', async () => {
    const deps = dependencies()
    const response = await createRecognizeReceiptHandler(deps)(
      request({
        imageBase64: 'A'.repeat(MAX_BASE64_LENGTH + 1),
        mimeType: 'image/jpeg',
      }),
    )
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      code: 'payload_too_large',
    })
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it.each([
    ['rate_limited', 429],
    ['provider_unavailable', 503],
    ['provider_timeout', 504],
  ] as const)('traduce proveedor %s de forma estable', async (code, status) => {
    const failing: OCRProvider = {
      recognize: vi.fn(async () => Promise.reject(new OCRFunctionError(code))),
    }
    const response = await createRecognizeReceiptHandler(
      dependencies({ createProvider: () => failing }),
    )(request())
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toMatchObject({ code })
    expect(failing.recognize).toHaveBeenCalledOnce()
  })

  it.each([
    [{ ...validResult, total: 12.34 }, 502, 'invalid_provider_response'],
    [
      {
        ...validResult,
        merchant: null,
        date: null,
        total: null,
        rawText: null,
      },
      200,
      null,
    ],
  ] as const)(
    'valida y normaliza la respuesta del proveedor (%s)',
    async (result, status, code) => {
      const fake: OCRProvider = { recognize: vi.fn(async () => result) }
      const response = await createRecognizeReceiptHandler(
        dependencies({ createProvider: () => fake }),
      )(request())
      expect(response.status).toBe(status)
      const body = await response.json()
      if (code) expect(body).toMatchObject({ code })
      else expect(body).toEqual(result)
      expect(fake.recognize).toHaveBeenCalledOnce()
    },
  )

  it('sanea errores desconocidos, no usa red/Storage/SQL y no filtra secretos', async () => {
    const fetchGuard = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unexpected real network'))
    const failing: OCRProvider = {
      recognize: vi.fn(async () => {
        throw new Error('secret-key stack internal-provider database.table')
      }),
    }
    const response = await createRecognizeReceiptHandler(
      dependencies({ createProvider: () => failing }),
    )(request())
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toBe(
      JSON.stringify({
        code: 'unknown',
        message: 'No fue posible reconocer el recibo.',
      }),
    )
    expect(fetchGuard).not.toHaveBeenCalled()
  })
})
