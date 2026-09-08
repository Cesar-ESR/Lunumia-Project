import { describe, expect, it, vi } from 'vitest'
import { OCRFunctionError } from '../errors/OCRFunctionError'
import {
  GROQ_CHAT_COMPLETIONS_ENDPOINT,
  GroqVisionOCRProvider,
  parseOCRDecimalCents,
} from './GroqVisionOCRProvider'

const input = {
  imageBytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  mimeType: 'image/jpeg' as const,
}

const extracted = {
  merchant: 'Tienda Ejemplo',
  date: '2026-01-15',
  currency: 'MXN',
  subtotal: '160.00',
  tax: '25.60',
  tip: '4.30',
  discount: null,
  otherFees: null,
  total: '189.90',
  amountPaid: '189.90',
  amountEvidence: 'TOTAL $189.90',
  amountAmbiguous: false,
  confidence: 0.91,
}

function groqResponse(content: unknown = extracted, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

function provider(response: Response = groqResponse()) {
  const fetcher = vi.fn(async () => response)
  return {
    instance: new GroqVisionOCRProvider({
      apiKey: 'server-secret',
      model: 'qwen/qwen3.6-27b',
      fetcher,
    }),
    fetcher,
  }
}

describe('GroqVisionOCRProvider', () => {
  it.each([
    'subtotal',
    'tax',
    'tip',
    'discount',
    'otherFees',
    'total',
    'amountPaid',
  ])(
    'normaliza agrupación válida en %s y mantiene una llamada',
    async (field) => {
      const { instance, fetcher } = provider(
        groqResponse({ ...extracted, [field]: '1,006.00' }),
      )
      await expect(
        instance.recognize(input, new AbortController().signal),
      ).resolves.toMatchObject({ [field]: 100600 })
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )

  it.each([
    '10,06.00',
    '1,00,6.00',
    '1,006.000',
    '1,006.',
    '$1,006.00',
    'MXN 1,006.00',
    '1 006.00',
    '1.006,00',
    '1006,00',
    '1e3',
    'NaN',
    'Infinity',
    1006,
    ' 1,006.00',
    '1,006.00 ',
  ])('el schema sigue rechazando formato no autorizado %#', async (value) => {
    await expect(
      provider(groqResponse({ ...extracted, total: value })).instance.recognize(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
  })

  it('golden agrupado: conserva fecha, pago y amountPaid tras normalizar', async () => {
    const { instance } = provider(
      groqResponse({
        ...extracted,
        date: '2026-05-19',
        total: '1,006.00',
        amountPaid: '1,006.00',
      }),
    )
    await expect(
      instance.recognize(input, new AbortController().signal),
    ).resolves.toMatchObject({
      date: '2026-05-19',
      total: 100600,
      amountPaid: 100600,
    })
  })
  it.each([
    [
      'provider_json_parse_failed',
      () => new Response('private-token raw OCR'),
      undefined,
    ],
    [
      'completion_schema_failed',
      () => Response.json({ choices: [] }),
      'choices',
    ],
    [
      'missing_content',
      () => Response.json({ choices: [{ message: {} }] }),
      'choices.index.message.content',
    ],
    [
      'completion_content_json_failed',
      () =>
        Response.json({
          choices: [{ message: { content: 'private-token raw OCR' } }],
        }),
      undefined,
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, total: undefined }),
      'total',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, 'private-token': 'bank-reference' }),
      'root',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, total: '$1,006.00' }),
      'total',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, total: 1006 }),
      'total',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, amountAmbiguous: 'false' }),
      'amountAmbiguous',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, confidence: 95 }),
      'confidence',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, date: '19/05/2026' }),
      'date',
    ],
    [
      'receipt_schema_failed',
      () => groqResponse({ ...extracted, currency: 'pesos' }),
      'currency',
    ],
    [
      'canonical_receipt_schema_failed',
      () => groqResponse({ ...extracted, date: '2026-02-30' }),
      'date',
    ],
  ] as const)(
    'diagnóstico %s, campo %s sin contenido sensible',
    async (phase, response, field) => {
      const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      try {
        const { instance, fetcher } = provider(response())
        await expect(
          instance.recognize(input, new AbortController().signal),
        ).rejects.toMatchObject({ code: 'invalid_provider_response' })
        expect(fetcher).toHaveBeenCalledOnce()
        const diagnostic = JSON.parse(String(log.mock.calls.at(-1)?.[1]))
        expect(diagnostic).toMatchObject({
          provider: 'groq',
          operation: 'recognize-receipt',
          phase,
          upstreamStatus: 200,
          durationMs: expect.any(Number),
        })
        if (field)
          expect(diagnostic.issues).toContainEqual(
            expect.objectContaining({ schemaField: field }),
          )
        const logs = JSON.stringify(log.mock.calls)
        for (const secret of [
          'server-secret',
          'private-token',
          'raw OCR',
          'bank-reference',
          '/9j/2Q==',
          'Authorization',
          'TOTAL $189.90',
        ])
          expect(logs).not.toContain(secret)
      } finally {
        log.mockRestore()
      }
    },
  )

  it('golden: preserva pago 1006.00 sin seleccionar efectivo 1050.00 ni cambio 44.00', async () => {
    const { instance } = provider(
      groqResponse({
        ...extracted,
        date: '2026-05-19',
        total: '1006.00',
        amountPaid: '1006.00',
        subtotal: null,
        tax: null,
        tip: null,
        amountEvidence: 'IMPORTE DE PAGO $1,006.00',
      }),
    )
    await expect(
      instance.recognize(input, new AbortController().signal),
    ).resolves.toMatchObject({
      date: '2026-05-19',
      total: 100600,
      amountPaid: 100600,
    })
  })
  it('envía una imagen multimodal y convierte decimales a centavos exactos', async () => {
    const { instance, fetcher } = provider()
    await expect(
      instance.recognize(input, new AbortController().signal),
    ).resolves.toEqual({
      merchant: 'Tienda Ejemplo',
      date: '2026-01-15',
      currency: 'MXN',
      subtotal: 16_000,
      tax: 2_560,
      tip: 430,
      discount: null,
      otherFees: null,
      total: 18_990,
      amountPaid: 18_990,
      amountEvidence: 'TOTAL $189.90',
      amountAmbiguous: false,
      confidence: 0.91,
      rawText: null,
    })
    expect(fetcher).toHaveBeenCalledWith(
      GROQ_CHAT_COMPLETIONS_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer server-secret',
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      }),
    )
    const request = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>
    expect(request).toMatchObject({
      model: 'qwen/qwen3.6-27b',
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
    })
    expect(JSON.stringify(request)).toContain('data:image/jpeg;base64,/9j/2Q==')
    expect(JSON.stringify(request)).toMatch(/cash tendered.*change/i)
  })

  it('usa parser decimal estricto sin parseFloat', () => {
    expect(parseOCRDecimalCents('189.90')).toBe(18_990)
    expect(parseOCRDecimalCents('189.9')).toBe(18_990)
    expect(parseOCRDecimalCents('-189.90')).toBe(-18_990)
    expect(parseOCRDecimalCents('1,234.56')).toBeNull()
    expect(parseOCRDecimalCents('$189.90 MXN')).toBeNull()
    expect(parseOCRDecimalCents('1.234')).toBeNull()
    expect(parseOCRDecimalCents(null)).toBeNull()
  })

  it('preserva null, moneda desconocida y ambigüedad', async () => {
    const empty = {
      ...extracted,
      currency: null,
      subtotal: null,
      tax: null,
      tip: null,
      total: null,
      amountPaid: null,
      amountEvidence: null,
      amountAmbiguous: true,
      confidence: null,
    }
    await expect(
      provider(groqResponse(empty)).instance.recognize(
        input,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      currency: null,
      total: null,
      amountAmbiguous: true,
      confidence: null,
    })
  })

  it('rechaza JSON, campos faltantes y propiedades extra', async () => {
    await expect(
      provider(
        Response.json({ choices: [{ message: { content: '{invalid' } }] }),
      ).instance.recognize(input, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
    await expect(
      provider(
        groqResponse({ ...extracted, total: undefined }),
      ).instance.recognize(input, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
    await expect(
      provider(groqResponse({ ...extracted, secret: 'no' })).instance.recognize(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
  })

  it.each([
    [400, 'invalid_image'],
    [401, 'provider_unavailable'],
    [403, 'provider_unavailable'],
    [404, 'provider_unavailable'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
    [503, 'provider_unavailable'],
    [504, 'provider_timeout'],
  ] as const)('mapea upstream %s a %s', async (status, code) => {
    await expect(
      provider(new Response(null, { status })).instance.recognize(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code })
  })

  it('propaga abort como timeout y no registra datos sensibles', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          ),
        ),
    )
    const instance = new GroqVisionOCRProvider({
      apiKey: 'server-secret',
      model: 'qwen/qwen3.6-27b',
      fetcher,
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const pending = instance.recognize(input, controller.signal)
    controller.abort()
    await expect(pending).rejects.toEqual(
      new OCRFunctionError('provider_timeout'),
    )
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('requiere key y modelo separados', () => {
    expect(
      () => new GroqVisionOCRProvider({ apiKey: '', model: 'qwen' }),
    ).toThrow(expect.objectContaining({ code: 'provider_unavailable' }))
    expect(
      () => new GroqVisionOCRProvider({ apiKey: 'key', model: '' }),
    ).toThrow(expect.objectContaining({ code: 'provider_unavailable' }))
  })

  it('rechaza antes de Groq una imagen que excedería el request base64', async () => {
    const { instance, fetcher } = provider()
    await expect(
      instance.recognize(
        {
          imageBytes: new Uint8Array(3_000_000),
          mimeType: 'image/jpeg',
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'payload_too_large' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
