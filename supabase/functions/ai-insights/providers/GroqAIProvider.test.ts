import { AIInsightsFunctionError } from '../errors.ts'
import { GROQ_CHAT_COMPLETIONS_URL, GroqAIProvider } from './GroqAIProvider.ts'
import { createAIProvider } from './ProviderFactory.ts'

const categoryId = '11111111-1111-4111-8111-111111111111'
const secondCategoryId = '22222222-2222-4222-8222-222222222222'
const apiKey = 'test-groq-secret'
const model = 'test-groq-model'

describe('GroqAIProvider', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mantiene suggest-category en JSON Object Mode', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(groqCompletion({ categoryId, confidence: 0.9 }))
    const provider = new GroqAIProvider({ apiKey, model, fetcher })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      provider.suggestCategory(
        {
          description: 'Supermercado',
          categories: [{ id: categoryId, name: 'Comida' }],
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ categoryId, confidence: 0.9 })

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(GROQ_CHAT_COMPLETIONS_URL)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model,
      temperature: 0,
      max_completion_tokens: 800,
      response_format: { type: 'json_object' },
    })
    expect(infoLogs()).toContain(
      '[ai] provider=groq operation=suggest-category phase=request',
    )
    expect(infoLogs()).toContain('model=test-groq-model')
    expect(infoLogs()).toContain('responseFormat=json_object')
    expect(infoLogs()).toContain('maxCompletionTokens=800')
    expect(infoLogs()).toContain('reasoningEffort=default')
    expect(infoLogs()).toContain('messageCount=2')
    expect(infoLogs()).toContain(
      'operation=suggest-category phase=response upstreamStatus=200',
    )
    expect(infoLogs()).toMatch(/durationMs=\d+/)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('usa JSON Schema estricto exclusivamente para period-summary', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        groqCompletion({ text: 'Resumen seguro.', highlights: [] }),
      )
    const provider = new GroqAIProvider({ apiKey, model, fetcher })

    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).resolves.toEqual({ text: 'Resumen seguro.', highlights: [] })

    const [, init] = fetcher.mock.calls[0]!
    const requestBody = JSON.parse(String(init?.body))
    expect(requestBody.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'period_summary',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            highlights: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['text', 'highlights'],
          additionalProperties: false,
        },
      },
    })
    expect(requestBody.max_completion_tokens).toBe(800)
    expect(requestBody).not.toHaveProperty('reasoning_effort')
    const systemPrompt = requestBody.messages[0].content as string
    const userMessage = requestBody.messages[1].content as string
    expect(userMessage).toContain('$7,000.00')
    expect(userMessage).toContain('$213.00')
    expect(userMessage).toContain('$140.00')
    expect(userMessage).toContain('$73.00')
    expect(userMessage).toContain('65.73%')
    expect(userMessage).toContain('34.27%')
    expect(userMessage).not.toMatch(/700000|21300|14000|7300/)
    expect(systemPrompt).toContain(
      'importes y porcentajes ya fueron calculados por la aplicación',
    )
    expect(systemPrompt).toContain('resumen histórico')
    expect(systemPrompt).toContain(
      'receivedIncome contiene sólo ingresos realizados',
    )
    expect(systemPrompt).toContain(
      'expected y cancelled no son ingresos históricos',
    )
    expect(systemPrompt).toContain('sin recalcular')
    expect(systemPrompt).toContain(
      'No presentes proyecciones como hechos actuales',
    )
    expect(systemPrompt).toContain('Reproduce literalmente')
    expect(systemPrompt).not.toMatch(
      /dividir entre 100|calcular porcentajes|convertir centavos/i,
    )
    expect(infoLogs()).toContain(
      'operation=period-summary phase=request model=test-groq-model responseFormat=json_schema',
    )
    expect(infoLogs()).toContain(
      'operation=period-summary phase=response upstreamStatus=200',
    )
    expect(infoLogs()).toContain(
      'operation=period-summary phase=schema_validation schemaValidation=ok',
    )
  })

  it('mantiene period-summary sin recuperación automática', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            type: 'invalid_request_error',
            code: 'json_validate_failed',
          },
        },
        { status: 400 },
      ),
    )
    const provider = new GroqAIProvider({ apiKey, model, fetcher })

    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(infoLogs()).toContain(
      'operation=period-summary phase=upstream upstreamStatus=400 internalType=structured_output_validation_failed',
    )
    expect(infoLogs()).not.toContain('recovery=')
  })

  it('valida resumen y explicaciones estructuradas', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        groqCompletion({ text: 'Resumen seguro.', highlights: ['Ahorro'] }),
      )
      .mockResolvedValueOnce(
        groqCompletion({
          explanations: [
            { categoryId, explanation: 'Aumentó según los datos.' },
            {
              categoryId: secondCategoryId,
              explanation: 'Disminuyó según los datos.',
            },
          ],
        }),
      )
    const provider = new GroqAIProvider({ apiKey, model, fetcher })
    const signal = new AbortController().signal

    await expect(
      provider.generatePeriodSummary(summaryInput(), signal),
    ).resolves.toEqual({ text: 'Resumen seguro.', highlights: ['Ahorro'] })

    await expect(
      provider.explainCategoryChanges(
        {
          changes: [
            {
              categoryId,
              categoryName: 'Comida',
              currentAmount: 2_000,
              previousAmount: 1_000,
              changePercentage: 100,
              absoluteChange: 1_000,
            },
            {
              categoryId: secondCategoryId,
              categoryName: 'Servicios',
              currentAmount: 500,
              previousAmount: 1_000,
              changePercentage: -50,
              absoluteChange: -500,
            },
          ],
        },
        signal,
      ),
    ).resolves.toHaveLength(2)

    const [, explainInit] = fetcher.mock.calls[1]!
    const explainRequest = JSON.parse(String(explainInit?.body))
    const explainPrompt = explainRequest.messages[0].content as string
    const explainUserMessage = explainRequest.messages[1].content as string
    expect(explainUserMessage).toContain('$20.00')
    expect(explainUserMessage).toContain('+100.00%')
    expect(explainUserMessage).not.toMatch(/2000|1000|500/)
    expect(explainPrompt).toContain('importes y porcentajes proporcionados')
  })

  it.each([
    [400, 'upstream_bad_request', 'provider_unavailable'],
    [401, 'provider_auth', 'provider_unavailable'],
    [403, 'provider_auth', 'provider_unavailable'],
    [408, 'timeout', 'provider_timeout'],
    [422, 'upstream_unprocessable', 'provider_unavailable'],
    [429, 'rate_limit', 'rate_limited'],
    [498, 'capacity', 'provider_unavailable'],
    [500, 'upstream_5xx', 'provider_unavailable'],
    [503, 'upstream_5xx', 'provider_unavailable'],
    [504, 'timeout', 'provider_timeout'],
    [418, 'upstream_http_error', 'provider_unavailable'],
  ] as const)(
    'registra HTTP %s como %s y conserva el error público %s',
    async (status, internalType, code) => {
      const provider = new GroqAIProvider({
        apiKey,
        model,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          Response.json(
            {
              error: {
                type: 'invalid_request_error',
                code: `groq_${status}`,
                message: 'Detalle upstream que no debe registrarse.',
              },
            },
            { status },
          ),
        ),
      })
      await expect(
        provider.suggestCategory(
          { description: 'Compra', categories: [] },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code })
      expect(infoLogs()).toContain(`upstreamStatus=${status}`)
      expect(infoLogs()).toContain(`internalType=${internalType}`)
      expect(infoLogs()).toContain('upstreamErrorType=invalid_request_error')
      expect(infoLogs()).toContain(`upstreamErrorCode=groq_${status}`)
      expect(infoLogs()).not.toContain('Detalle upstream')
    },
  )

  it('clasifica una excepción TypeError como network_error', async () => {
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError('detalle privado de red')),
    })
    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(infoLogs()).toContain(
      'operation=period-summary phase=transport internalType=network_error errorClass=TypeError',
    )
    expect(infoLogs()).not.toContain('detalle privado de red')
  })

  it('clasifica AbortError como timeout', async () => {
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new DOMException('aborted', 'AbortError')),
    })
    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'provider_timeout' })
    expect(infoLogs()).toContain(
      'operation=period-summary phase=transport internalType=timeout errorClass=AbortError',
    )
  })

  it('clasifica HTTP 200 con JSON inválido sin registrar el contenido', async () => {
    const invalidContent = 'contenido-no-json-privado'
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: invalidContent } }],
        }),
      ),
    })
    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
    expect(infoLogs()).toContain(
      'operation=period-summary phase=json_parse internalType=invalid_json',
    )
    expect(infoLogs()).not.toContain(invalidContent)
  })

  it('clasifica HTTP 200 con salida Zod inválida', async () => {
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(groqCompletion({ text: 'Falta highlights.' })),
    })
    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
    expect(infoLogs()).toContain(
      'operation=period-summary phase=schema_validation internalType=schema_validation_failed',
    )
  })

  it.each([
    {
      content: { text: 'Resumen', highlights: [], extra: true },
      caseName: 'propiedad extra',
    },
    {
      content: { text: 'x'.repeat(1_001), highlights: [] },
      caseName: 'text mayor a 1000',
    },
    {
      content: {
        text: 'Resumen',
        highlights: ['1', '2', '3', '4', '5', '6'],
      },
      caseName: 'mas de 5 highlights',
    },
  ])('rechaza con Zod: $caseName', async ({ content }) => {
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(groqCompletion(content)),
    })

    await expect(
      provider.generatePeriodSummary(
        summaryInput(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid_provider_response' })
    expect(infoLogs()).toContain(
      'operation=period-summary phase=schema_validation internalType=schema_validation_failed',
    )
  })

  it.each([
    [
      { choices: [{ message: { refusal: 'contenido privado' } }] },
      'provider_refusal',
    ],
    [{ choices: [{ message: { content: null } }] }, 'missing_content'],
  ] as const)(
    'clasifica una respuesta sin content como %s',
    async (body, internalType) => {
      const provider = new GroqAIProvider({
        apiKey,
        model,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
      })

      await expect(
        provider.generatePeriodSummary(
          summaryInput(),
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'invalid_provider_response' })
      expect(infoLogs()).toContain(
        `operation=period-summary phase=completion_content internalType=${internalType}`,
      )
      expect(infoLogs()).not.toContain('contenido privado')
    },
  )

  it('rechaza configuración o respuesta inválida sin exponer detalles', async () => {
    expect(() => new GroqAIProvider({ apiKey: '', model })).toThrowError(
      expect.objectContaining({ code: 'provider_unavailable' }),
    )
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(groqCompletion({ unexpected: true })),
    })
    await expect(
      provider.suggestCategory(
        { description: 'Compra', categories: [] },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(AIInsightsFunctionError)
    expect(infoLogs()).toContain(
      'operation=initialization phase=config internalType=provider_config',
    )
  })

  it('nunca registra Authorization, API key, prompts ni datos del input', async () => {
    const privateInput = 'private-prompt-marker'
    const upstreamMessage = `${apiKey} Bearer Authorization ${privateInput}`
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const provider = new GroqAIProvider({
      apiKey,
      model,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              type: 'invalid_request_error',
              code: apiKey,
              message: upstreamMessage,
            },
          },
          { status: 400 },
        ),
      ),
    })
    await expect(
      provider.suggestCategory(
        {
          description: privateInput,
          categories: [{ id: categoryId, name: 'private-category-marker' }],
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })

    const output = [
      ...vi.mocked(console.info).mock.calls,
      ...log.mock.calls,
      ...warn.mock.calls,
      ...error.mock.calls,
    ]
      .flat()
      .join(' ')
    expect(output).not.toContain(apiKey)
    expect(output).not.toContain('Authorization')
    expect(output).not.toContain('Bearer')
    expect(output).not.toContain(privateInput)
    expect(output).not.toContain('private-category-marker')
    expect(output).not.toContain('Clasifica el gasto usando exclusivamente')
    expect(output).not.toContain(upstreamMessage)
  })

  it('ProviderFactory selecciona groq y conserva mock solo fuera de producción', () => {
    expect(
      createAIProvider({
        provider: 'groq',
        runtimeEnvironment: 'production',
        groqApiKey: apiKey,
        groqModel: model,
      }),
    ).toBeInstanceOf(GroqAIProvider)
    expect(
      createAIProvider({ provider: 'mock', runtimeEnvironment: 'test' }),
    ).not.toBeInstanceOf(GroqAIProvider)
    expect(() =>
      createAIProvider({
        provider: 'groq',
        runtimeEnvironment: 'production',
      }),
    ).toThrowError(expect.objectContaining({ code: 'provider_unavailable' }))
  })
})

function groqCompletion(content: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
  })
}

function summaryInput() {
  return {
    context: 'historical' as const,
    facts: {
      receivedIncomeCents: 700_000,
      expenseCents: 21_300,
      categoryBreakdown: [
        {
          categoryId,
          categoryName: 'Comida',
          totalCents: 14_000,
          percentage: 65.73,
        },
        {
          categoryId: secondCategoryId,
          categoryName: 'Transporte',
          totalCents: 7_300,
          percentage: 34.27,
        },
      ],
      topExpenses: [
        { description: 'Hamburguesa', amountCents: 12_000 },
        { description: 'Uber al trabajo', amountCents: 5_000 },
        { description: 'Pasaje', amountCents: 2_300 },
        { description: 'Agua', amountCents: 2_000 },
      ],
      periodType: 'monthly' as const,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    },
  }
}

function infoLogs(): string {
  return vi.mocked(console.info).mock.calls.flat().join('\n')
}
