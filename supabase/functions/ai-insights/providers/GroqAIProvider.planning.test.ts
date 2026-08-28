import { GroqAIProvider } from './GroqAIProvider.ts'

const planningInput = {
  context: 'planning' as const,
  facts: {
    currentBalanceCents: 100_000,
    committedCents: 22_222,
    expectedIncomeCents: 33_333,
    projectedAvailableCents: 77_777,
    projectedClosingBalanceCents: -12_345,
    projectionCoverage: 'overdue_only' as const,
    projectionHorizonEnd: '2026-08-31',
  },
}
const validAnalysis = {
  summary: 'La proyección suministrada termina con saldo negativo estimado.',
  observations: ['La cobertura se limita a compromisos vencidos.'],
  considerations: ['La decisión final corresponde a la persona usuaria.'],
}

function completion(content: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
  })
}

function upstreamError(
  status: number,
  type: string,
  code: string,
  privateDetail = 'detalle upstream privado',
): Response {
  return Response.json(
    {
      error: {
        type,
        code,
        message: privateDetail,
        failed_generation: `failed_generation:${privateDetail}`,
      },
    },
    { status },
  )
}

describe('GroqAIProvider planning-analysis', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envía hechos aggregate-only formateados en MXN y exige JSON Schema estricto', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion(validAnalysis))
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).resolves.toEqual(validAnalysis)

    expect(fetcher).toHaveBeenCalledOnce()
    const [, init] = fetcher.mock.calls[0]!
    const request = JSON.parse(String(init?.body))
    const systemPrompt = request.messages[0].content as string
    const payload = JSON.parse(request.messages[1].content)
    expect(payload).toEqual({
      context: 'planning',
      facts: {
        currentBalance: '$1,000.00 MXN',
        committed: '$222.22 MXN',
        expectedIncome: '$333.33 MXN',
        projectedAvailable: '$777.77 MXN',
        projectedClosingBalance: '-$123.45 MXN',
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: '2026-08-31',
      },
    })
    expect(JSON.stringify(payload)).not.toMatch(/Cents|100000|22222|33333/)
    expect(JSON.stringify(payload)).not.toMatch(
      /description|receipt|expense|movement|merchant|notes/i,
    )
    expect(systemPrompt).toMatch(/exclusivamente los hechos suministrados/i)
    expect(systemPrompt).toMatch(/pesos mexicanos \(MXN\)/i)
    expect(systemPrompt).toMatch(/reprodúcelos literalmente/i)
    expect(systemPrompt).toMatch(
      /no recalcules, conviertas, sumes, restes, reformatees ni inventes cifras/i,
    )
    expect(systemPrompt).not.toMatch(/enteros en centavos/i)
    expect(systemPrompt).toMatch(/null significa desconocido/i)
    expect(systemPrompt).toMatch(/valores negativos son válidos/i)
    expect(systemPrompt).toMatch(/dinero futuro/i)
    expect(systemPrompt).toMatch(/estimación, no una certeza/i)
    expect(systemPrompt).toMatch(/overdue_only/i)
    expect(systemPrompt).toMatch(
      /exactamente las propiedades summary, observations y considerations/i,
    )
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'planning_analysis', strict: true },
    })
    expect(
      request.response_format.json_schema.schema.additionalProperties,
    ).toBe(false)
  })

  it('reintenta una vez el mismo JSON Schema y acepta el segundo intento', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        upstreamError(400, 'invalid_request_error', 'json_validate_failed'),
      )
      .mockResolvedValueOnce(completion(validAnalysis))
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).resolves.toEqual(validAnalysis)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(
      requestBodies(fetcher).map(({ response_format }) => response_format),
    ).toEqual([
      expect.objectContaining({
        type: 'json_schema',
        json_schema: expect.objectContaining({ strict: true }),
      }),
      expect.objectContaining({
        type: 'json_schema',
        json_schema: expect.objectContaining({ strict: true }),
      }),
    ])
    expect(infoLogs()).toContain(
      'internalType=structured_output_validation_failed',
    )
    expect(infoLogs()).toContain('upstreamStatus=400')
    expect(infoLogs()).toContain('upstreamErrorType=invalid_request_error')
    expect(infoLogs()).toContain('upstreamErrorCode=json_validate_failed')
    expect(infoLogs()).toContain('responseFormat=json_schema')
    expect(infoLogs()).toContain('attempt=1')
    expect(infoLogs()).toContain('attempt=2')
    expect(infoLogs()).toContain('recovery=json_validate_failed_retry')
    expect(infoLogs()).not.toContain('recovery=json_object_fallback')
  })

  it('usa un único fallback JSON Object tras dos fallos estructurados', async () => {
    const privateDetail = 'private-failed-generation-marker'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        upstreamError(
          400,
          'invalid_request_error',
          'json_validate_failed',
          privateDetail,
        ),
      )
      .mockResolvedValueOnce(
        upstreamError(
          400,
          'invalid_request_error',
          'json_validate_failed',
          privateDetail,
        ),
      )
      .mockResolvedValueOnce(completion(validAnalysis))
    const provider = new GroqAIProvider({
      apiKey: 'private-api-key-marker',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).resolves.toEqual(validAnalysis)

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(
      requestBodies(fetcher).map(({ response_format }) => response_format.type),
    ).toEqual(['json_schema', 'json_schema', 'json_object'])
    const fallbackRequest = requestBodies(fetcher)[2]!
    expect(fallbackRequest.messages[0].content).toMatch(
      /exactamente las propiedades summary, observations y considerations/i,
    )
    expect(infoLogs()).toContain('attempt=3')
    expect(infoLogs()).toContain('responseFormat=json_object')
    expect(infoLogs()).toContain('recovery=json_object_fallback')
    expect(infoLogs()).not.toContain(privateDetail)
    expect(infoLogs()).not.toContain('failed_generation')
    expect(infoLogs()).not.toContain('private-api-key-marker')
    expect(infoLogs()).not.toContain('100000')
    expect(infoLogs()).not.toContain('Explica brevemente')
  })

  it('no usa fallback si el segundo error no conserva el fingerprint exacto', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        upstreamError(400, 'invalid_request_error', 'json_validate_failed'),
      )
      .mockResolvedValueOnce(
        upstreamError(400, 'invalid_request_error', 'different_code'),
      )
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(infoLogs()).not.toContain('recovery=json_object_fallback')
  })

  it('rechaza de forma segura un fallback que viola el contrato Zod', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        upstreamError(400, 'invalid_request_error', 'json_validate_failed'),
      )
      .mockResolvedValueOnce(
        upstreamError(400, 'invalid_request_error', 'json_validate_failed'),
      )
      .mockResolvedValueOnce(
        completion({ ...validAnalysis, safeToSpendCents: 50_000 }),
      )
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(infoLogs()).toContain(
      'phase=schema_validation internalType=schema_validation_failed',
    )
  })

  it.each([
    [400, 'invalid_request_error', 'different_code', 'provider_unavailable'],
    [401, 'authentication_error', 'invalid_api_key', 'provider_unavailable'],
    [403, 'permission_error', 'forbidden', 'provider_unavailable'],
    [429, 'rate_limit_error', 'rate_limit_exceeded', 'rate_limited'],
    [408, 'timeout_error', 'request_timeout', 'provider_timeout'],
    [504, 'timeout_error', 'gateway_timeout', 'provider_timeout'],
    [500, 'server_error', 'internal_error', 'provider_unavailable'],
    [502, 'server_error', 'bad_gateway', 'provider_unavailable'],
    [503, 'server_error', 'unavailable', 'provider_unavailable'],
  ] as const)(
    'no activa recuperación para HTTP %s con code=%s',
    async (status, type, code, expectedPublicCode) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(upstreamError(status, type, code))
      const provider = new GroqAIProvider({
        apiKey: 'test-key',
        model: 'test-model',
        fetcher,
      })

      await expect(
        provider.analyzePlanning(planningInput, new AbortController().signal),
      ).rejects.toMatchObject({ code: expectedPublicCode })
      expect(fetcher).toHaveBeenCalledOnce()
      expect(infoLogs()).not.toContain('recovery=')
    },
  )

  it('nunca supera tres llamadas aunque el fallback también falle', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          upstreamError(400, 'invalid_request_error', 'json_validate_failed'),
        ),
      )
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(
      requestBodies(fetcher).map(({ response_format }) => response_format.type),
    ).toEqual(['json_schema', 'json_schema', 'json_object'])
  })

  it('rechaza respuesta malformada sin adivinar JSON financiero', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        completion({ ...validAnalysis, safeToSpendCents: 50_000 }),
      )
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
  })

  it('normaliza timeout del transporte', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const provider = new GroqAIProvider({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher,
    })

    await expect(
      provider.analyzePlanning(planningInput, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'provider_timeout' })
  })
})

function requestBodies(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
}

function infoLogs(): string {
  return vi.mocked(console.info).mock.calls.flat().join('\n')
}
