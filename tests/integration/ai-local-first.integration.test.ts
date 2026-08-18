import { createApplicationServices } from '../../src/app/composition-root'
import {
  ExplainCategoryChanges,
  GeneratePeriodSummary,
  SuggestExpenseCategory,
  buildCalculatedCategoryChanges,
  buildPeriodAggregatedData,
} from '../../src/application/use-cases/ai-insights'
import type { AIInsightsProvider } from '@domain/ports'
import { GastoClaroDB } from '@infrastructure/local/database'
import { periodDataFingerprint } from '../../src/presentation/hooks/usePeriodSummary'

describe('IA mantiene el flujo local-first', () => {
  let database: GastoClaroDB

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    database = new GastoClaroDB(`ai-local-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await database.delete()
    vi.unstubAllEnvs()
  })

  it('1-10. guarda y encola el gasto; IA no persiste ni modifica entidades', async () => {
    const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const services = createApplicationServices(ownerId, database)
    await services.initialize.execute()
    const period = await services.periods.createPeriod.execute({
      ownerId,
      type: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    const category = (await services.categories.listCategories.execute())[0]
    expect(category).toBeDefined()

    const before = buildPeriodAggregatedData(period, [], [], [category!])
    await database.syncOperations.clear()
    const created = await services.expenses.createExpense.execute({
      ownerId,
      periodId: period.id,
      categoryId: category!.id,
      amount: 12_345,
      description: 'Supermercado',
      date: '2026-08-10',
    })
    const stored = await database.expenses.get(created.id)
    const queued = await database.syncOperations.toArray()
    expect(stored).toEqual(created)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      entityType: 'expense',
      operationType: 'create',
    })

    const after = buildPeriodAggregatedData(period, [], [created], [category!])
    expect(after.totalExpenses).toBe(12_345)
    expect(periodDataFingerprint(after)).not.toBe(periodDataFingerprint(before))

    const provider: AIInsightsProvider = {
      suggestCategory: vi.fn(async () => ({
        categoryId: category!.id,
        confidence: 0.9,
      })),
      generatePeriodSummary: vi.fn(async (aggregates) => ({
        text: `Total ${aggregates.totalExpenses}`,
        highlights: ['Generado'],
      })),
      explainCategoryChanges: vi.fn(
        async (
          changes: Parameters<AIInsightsProvider['explainCategoryChanges']>[0],
        ) =>
          changes.map(({ categoryId }) => ({
            categoryId,
            explanation: 'Cambio',
          })),
      ),
    }
    await new SuggestExpenseCategory(provider).execute(
      created.description,
      [category!],
      ownerId,
    )
    await new GeneratePeriodSummary(provider).execute(before)
    const regenerated = await new GeneratePeriodSummary(provider).execute(after)
    await new ExplainCategoryChanges(provider).execute(
      buildCalculatedCategoryChanges([created], [], [category!]),
    )
    expect(regenerated.text).toBe('Total 12345')
    expect(provider.generatePeriodSummary).toHaveBeenLastCalledWith(after)

    expect(await database.expenses.get(created.id)).toEqual(created)
    expect(await database.syncOperations.toArray()).toEqual(queued)
    const persisted = JSON.stringify({
      expenses: await database.expenses.toArray(),
      operations: await database.syncOperations.toArray(),
    })
    expect(persisted).not.toMatch(/Generado|Cambio|confidence|Resumen/)
  })

  it('IA completamente deshabilitada no bloquea el flujo financiero completo', async () => {
    const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const services = createApplicationServices(ownerId, database)
    expect(services.aiInsights).toBeNull()
    await services.initialize.execute()
    const period = await services.periods.createPeriod.execute({
      ownerId,
      type: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    const category = (await services.categories.listCategories.execute())[0]
    expect(category).toBeDefined()
    await database.syncOperations.clear()

    await services.incomes.createIncome.execute({
      ownerId,
      periodId: period.id,
      amount: 100_000,
      description: 'Ingreso local',
      date: '2026-08-01',
    })
    const expense = await services.expenses.createExpense.execute({
      ownerId,
      periodId: period.id,
      categoryId: category!.id,
      amount: 25_000,
      description: 'Gasto local',
      date: '2026-08-10',
    })
    await services.budgets.upsertCategoryBudget.execute({
      ownerId,
      periodId: period.id,
      categoryId: category!.id,
      amount: 50_000,
    })
    await services.balance.setCurrentBalance.execute({
      ownerId,
      amount: 75_000,
    })

    const [financial, budget] = await Promise.all([
      services.dashboard.getFinancialSnapshot.execute(),
      services.dashboard.getBudgetSummary.execute(period, '2026-08-15'),
    ])
    expect(financial).toMatchObject({
      currentBalanceCents: 75_000,
      projectedAvailableCents: 75_000,
    })
    expect(budget).toMatchObject({
      totalBudget: 50_000,
      budgetRemaining: 25_000,
    })
    const changes = buildCalculatedCategoryChanges([expense], [], [category!])
    expect(changes[0]).toMatchObject({
      currentAmount: 25_000,
      previousAmount: 0,
      absoluteChange: 25_000,
      changePercentage: null,
    })

    const updated = await services.expenses.updateExpense.execute(expense.id, {
      ownerId,
      periodId: period.id,
      categoryId: category!.id,
      amount: 20_000,
      description: 'Gasto editado localmente',
      date: '2026-08-10',
    })
    expect(updated.amount).toBe(20_000)
    await services.expenses.deleteExpense.execute(expense.id)
    expect(
      await services.expenses.listExpensesByPeriod.execute(period.id),
    ).toEqual([])

    const operations = await database.syncOperations.toArray()
    expect(operations).toHaveLength(6)
    expect(
      operations.filter(({ operationType }) => operationType === 'create'),
    ).toHaveLength(4)
    expect(
      operations.filter(({ operationType }) => operationType === 'update'),
    ).toHaveLength(1)
    expect(
      operations.filter(({ operationType }) => operationType === 'delete'),
    ).toHaveLength(1)
    expect(JSON.stringify(operations)).not.toMatch(
      /AIResponse|AISummary|AISuggestion|AIExplanation|prompt|highlight/i,
    )
  })

  it('respuestas IA viven solo en memoria y no crean almacenes o claves persistentes', async () => {
    const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const services = createApplicationServices(ownerId, database)
    await services.initialize.execute()
    const category = (await services.categories.listCategories.execute())[0]
    expect(category).toBeDefined()
    const responseMarker = 'AI_RESPONSE_MUST_REMAIN_EPHEMERAL'
    const provider: AIInsightsProvider = {
      suggestCategory: async () => ({
        categoryId: category!.id,
        confidence: 1,
      }),
      generatePeriodSummary: async () => ({
        text: responseMarker,
        highlights: [responseMarker],
      }),
      explainCategoryChanges: async () => [
        { categoryId: category!.id, explanation: responseMarker },
      ],
    }
    await provider.suggestCategory('Prompt privado', [category!])
    await provider.generatePeriodSummary({
      totalIncome: 1,
      totalExpenses: 1,
      categoryBreakdown: [],
      periodType: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    await provider.explainCategoryChanges([])

    const databaseSnapshot = JSON.stringify(
      await Promise.all(database.tables.map((table) => table.toArray())),
    )
    expect(database.tables.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining([
        'AIResponse',
        'AISummary',
        'AISuggestion',
        'AIExplanation',
      ]),
    )
    expect(databaseSnapshot).not.toContain(responseMarker)
    expect(JSON.stringify(localStorage)).not.toContain(responseMarker)
    expect(JSON.stringify(sessionStorage)).not.toContain(responseMarker)
  })
})
