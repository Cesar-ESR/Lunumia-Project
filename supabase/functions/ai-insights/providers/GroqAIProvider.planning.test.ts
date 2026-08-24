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

describe('GroqAIProvider planning-analysis', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envía hechos aggregate-only exactos y exige JSON Schema estricto', async () => {
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

    const [, init] = fetcher.mock.calls[0]!
    const request = JSON.parse(String(init?.body))
    const systemPrompt = request.messages[0].content as string
    const payload = JSON.parse(request.messages[1].content)
    expect(payload).toEqual(planningInput)
    expect(payload.facts).toMatchObject({
      currentBalanceCents: 100_000,
      projectedAvailableCents: 77_777,
      projectedClosingBalanceCents: -12_345,
      projectionCoverage: 'overdue_only',
      projectionHorizonEnd: '2026-08-31',
    })
    expect(JSON.stringify(payload)).not.toMatch(
      /description|receipt|expense|movement|merchant|notes/i,
    )
    expect(systemPrompt).toMatch(/exclusivamente los hechos suministrados/i)
    expect(systemPrompt).toMatch(/null significa desconocido/i)
    expect(systemPrompt).toMatch(/valores negativos son válidos/i)
    expect(systemPrompt).toMatch(/dinero futuro/i)
    expect(systemPrompt).toMatch(/estimación, no una certeza/i)
    expect(systemPrompt).toMatch(/overdue_only/i)
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'planning_analysis', strict: true },
    })
    expect(
      request.response_format.json_schema.schema.additionalProperties,
    ).toBe(false)
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
