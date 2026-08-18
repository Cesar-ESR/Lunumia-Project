import type { Category, Expense, Income, Period } from '@domain/entities'
import type { AIInsightsProvider } from '@domain/ports'
import { buildHistoricalAnalysisRequest } from '@application/contracts'
import {
  ExplainCategoryChanges,
  buildCalculatedCategoryChanges,
} from './ExplainCategoryChanges'
import {
  GeneratePeriodSummary,
  buildPeriodAggregatedData,
} from './GeneratePeriodSummary'
import { SuggestExpenseCategory } from './SuggestExpenseCategory'

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const categoryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const periodId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const previousPeriodId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const now = '2026-08-01T00:00:00.000Z'
const syncable = {
  ownerId,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  syncStatus: 'synced' as const,
}
const period: Period = {
  id: periodId,
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  ...syncable,
}
const category: Category = {
  id: categoryId,
  name: 'Comida',
  normalizedName: 'comida',
  color: '#123456',
  icon: null,
  isSystem: false,
  ...syncable,
}
const expense = (overrides: Partial<Expense> = {}): Expense => ({
  id: crypto.randomUUID(),
  periodId,
  categoryId,
  amount: 12_345,
  description: 'Supermercado',
  date: '2026-08-10',
  recurringOccurrenceId: null,
  ...syncable,
  ...overrides,
})
const income = (overrides: Partial<Income> = {}): Income => ({
  id: crypto.randomUUID(),
  periodId,
  amount: 50_000,
  description: 'Sueldo',
  date: '2026-08-01',
  ...syncable,
  ...overrides,
})

function fakeProvider(): AIInsightsProvider {
  return {
    suggestCategory: vi.fn(async () => ({ categoryId, confidence: 0.8 })),
    generatePeriodSummary: vi.fn(async () => ({
      text: 'Resumen',
      highlights: ['Dato'],
    })),
    explainCategoryChanges: vi.fn(async () => [
      { categoryId, explanation: 'Subió' },
    ]),
  }
}

describe('casos de uso de IA con cifras locales', () => {
  it('23, 26-29, 69-70, 72-73. construye solo agregados locales, enteros y porcentajes TypeScript', () => {
    const data = buildPeriodAggregatedData(
      period,
      [income()],
      [expense(), expense({ amount: 7_655, description: 'Café' })],
      [category],
    )
    expect(data).toEqual({
      totalIncome: 50_000,
      totalExpenses: 20_000,
      categoryBreakdown: [
        {
          categoryId,
          categoryName: 'Comida',
          total: 20_000,
          percentage: 100,
        },
      ],
      topExpenses: [
        { description: 'Supermercado', amount: 12_345 },
        { description: 'Café', amount: 7_655 },
      ],
      periodType: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    expect(JSON.stringify(data)).not.toMatch(
      /ownerId|email|syncStatus|image|ocr/i,
    )
    expect(Number.isInteger(data.totalExpenses)).toBe(true)
  })

  it('regresión 11.3: excluye movimientos de otro propietario aunque compartan periodo', () => {
    const foreignOwner = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const data = buildPeriodAggregatedData(
      period,
      [income(), income({ ownerId: foreignOwner, amount: 1 })],
      [expense(), expense({ ownerId: foreignOwner, amount: 1 })],
      [category],
    )
    expect(data.totalIncome).toBe(50_000)
    expect(data.totalExpenses).toBe(12_345)
    expect(data.categoryBreakdown[0]?.total).toBe(12_345)
  })

  it('conserva el total histórico sólo con ingresos recibidos', () => {
    const received = {
      ...income({ amount: 10_000 }),
      status: 'received' as const,
      affectsBalance: true,
      balanceEffectiveAt: now,
    }
    const expected = {
      ...income({ amount: 20_000 }),
      status: 'expected' as const,
      affectsBalance: false,
      balanceEffectiveAt: null,
    }
    const cancelled = {
      ...income({ amount: 30_000 }),
      status: 'cancelled' as const,
      affectsBalance: false,
      balanceEffectiveAt: null,
    }

    const data = buildPeriodAggregatedData(
      period,
      [received, expected, cancelled],
      [],
      [category],
    )

    const request = buildHistoricalAnalysisRequest(data)

    expect(data.totalIncome).toBe(10_000)
    expect(request.facts.receivedIncomeCents).toBe(10_000)
    expect(JSON.stringify(request)).not.toMatch(
      /20000|30000|expected|cancelled/,
    )
  })

  it('39-40, 76-78. los casos de IA solo delegan payloads y no persisten ni crean SyncOperation', async () => {
    const provider = fakeProvider()
    const data = buildPeriodAggregatedData(
      period,
      [income()],
      [expense()],
      [category],
    )
    await new GeneratePeriodSummary(provider).execute(data)
    await new ExplainCategoryChanges(provider).execute(
      buildCalculatedCategoryChanges([expense()], [], [category]),
    )
    expect(provider.generatePeriodSummary).toHaveBeenCalledWith(data)
    expect(provider.explainCategoryChanges).toHaveBeenCalledOnce()
    expect(
      JSON.stringify([
        vi.mocked(provider.generatePeriodSummary).mock.calls,
        vi.mocked(provider.explainCategoryChanges).mock.calls,
      ]),
    ).not.toContain('service_role')
  })

  it('41-48, 71. calcula cambios y porcentajes localmente sin enviar transacciones', async () => {
    const current = [expense({ amount: 15_000 })]
    const previous = [expense({ periodId: previousPeriodId, amount: 10_000 })]
    const changes = buildCalculatedCategoryChanges(current, previous, [
      category,
    ])
    expect(changes).toEqual([
      {
        categoryId,
        categoryName: 'Comida',
        currentAmount: 15_000,
        previousAmount: 10_000,
        absoluteChange: 5_000,
        changePercentage: 50,
      },
    ])
    expect(JSON.stringify(changes)).not.toMatch(/description|date|periodId/)
  })

  it('45-46. cero anterior no produce Infinity y ambos ceros se omiten', () => {
    const fromZero = buildCalculatedCategoryChanges([expense()], [], [category])
    const bothZero = buildCalculatedCategoryChanges([], [], [category])
    expect(fromZero[0]?.changePercentage).toBeNull()
    expect(JSON.stringify(fromZero)).not.toMatch(/Infinity|NaN/)
    expect(bothZero).toEqual([])
  })

  it('67-68, 74-75. suggest-category envía solo descripción y categorías mínimas', async () => {
    const provider = fakeProvider()
    const result = await new SuggestExpenseCategory(provider).execute(
      'Supermercado',
      [category],
      ownerId,
    )
    expect(result?.categoryId).toBe(categoryId)
    expect(provider.suggestCategory).toHaveBeenCalledWith('Supermercado', [
      { id: categoryId, name: 'Comida' },
    ])
    const payload = JSON.stringify(
      vi.mocked(provider.suggestCategory).mock.calls[0],
    )
    expect(payload).not.toMatch(/amount|ownerId|userId|email|syncStatus/)
  })
})
