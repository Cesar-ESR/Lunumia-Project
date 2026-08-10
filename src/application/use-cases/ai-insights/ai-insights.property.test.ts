import fc from 'fast-check'
import type { Category, Expense, Income, Period } from '@domain/entities'
import type { AIInsightsProvider } from '@domain/ports'
import { GeneratePeriodSummary, buildPeriodAggregatedData } from './index'

const ownerId = 'owner-a'
const periodId = 'period-current'
const timestamp = '2026-08-01T00:00:00.000Z'
const base = {
  createdAt: timestamp,
  updatedAt: timestamp,
  syncStatus: 'synced' as const,
}
const period: Period = {
  ...base,
  id: periodId,
  ownerId,
  deletedAt: null,
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
}
const categoryIds = ['category-0', 'category-1', 'category-2'] as const

interface GeneratedMovement {
  amount: number
  categoryIndex: number
  deleted: boolean
  foreignOwner: boolean
  otherPeriod: boolean
}

const movementArbitrary = fc.record({
  amount: fc.integer({ min: 0, max: 1_000_000 }),
  categoryIndex: fc.integer({ min: 0, max: categoryIds.length - 1 }),
  deleted: fc.boolean(),
  foreignOwner: fc.boolean(),
  otherPeriod: fc.boolean(),
})

function categories(deleted: readonly boolean[]): Category[] {
  return categoryIds.map((id, index) => ({
    ...base,
    id,
    ownerId,
    deletedAt: deleted[index] ? timestamp : null,
    name: `Categoría ${index}`,
    normalizedName: `categoria ${index}`,
    color: '#000000',
    icon: null,
    isSystem: false,
  }))
}

function incomes(values: readonly GeneratedMovement[]): Income[] {
  return values.map((value, index) => ({
    ...base,
    id: `income-${index}`,
    ownerId: value.foreignOwner ? 'owner-b' : ownerId,
    periodId: value.otherPeriod ? 'period-other' : periodId,
    deletedAt: value.deleted ? timestamp : null,
    amount: value.amount,
    description: `Ingreso ${index}`,
    date: '2026-08-10',
  }))
}

function expenses(values: readonly GeneratedMovement[]): Expense[] {
  return values.map((value, index) => ({
    ...base,
    id: `expense-${index}`,
    ownerId: value.foreignOwner ? 'owner-b' : ownerId,
    periodId: value.otherPeriod ? 'period-other' : periodId,
    categoryId: categoryIds[value.categoryIndex] ?? categoryIds[0],
    deletedAt: value.deleted ? timestamp : null,
    amount: value.amount,
    description: `Gasto ${index}`,
    date: '2026-08-10',
    recurringOccurrenceId: null,
  }))
}

const applies = (value: GeneratedMovement) =>
  !value.deleted && !value.foreignOwner && !value.otherPeriod

describe('propiedades de agregados suministrados a IA', () => {
  it('Feature: gasto-claro-app, Property AI-5: agregados coinciden con un modelo puro local', () => {
    fc.assert(
      fc.property(
        fc.array(movementArbitrary, { maxLength: 30 }),
        fc.array(movementArbitrary, { maxLength: 30 }),
        fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
        (incomeValues, expenseValues, deletedCategories) => {
          const result = buildPeriodAggregatedData(
            period,
            incomes(incomeValues),
            expenses(expenseValues),
            categories(deletedCategories),
          )
          const expectedIncome = incomeValues
            .filter(applies)
            .reduce((sum, { amount }) => sum + amount, 0)
          const expectedExpenses = expenseValues
            .filter(applies)
            .reduce((sum, { amount }) => sum + amount, 0)

          expect(result.totalIncome).toBe(expectedIncome)
          expect(result.totalExpenses).toBe(expectedExpenses)
          expect(Number.isInteger(result.totalIncome)).toBe(true)
          expect(Number.isInteger(result.totalExpenses)).toBe(true)
          for (const item of result.categoryBreakdown) {
            const index = categoryIds.findIndex(
              (categoryId) => categoryId === item.categoryId,
            )
            const expectedTotal = expenseValues
              .filter(
                (value) =>
                  applies(value) &&
                  value.categoryIndex === index &&
                  !deletedCategories[index],
              )
              .reduce((sum, { amount }) => sum + amount, 0)
            expect(item.total).toBe(expectedTotal)
            expect(item.percentage).toBe(
              expectedExpenses === 0
                ? 0
                : (expectedTotal / expectedExpenses) * 100,
            )
            expect(Number.isFinite(item.percentage)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('Feature: gasto-claro-app, Property AI-6: cualquier salida o fallo IA deja idénticas las cifras', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(movementArbitrary, { maxLength: 20 }),
        fc.array(movementArbitrary, { maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (incomeValues, expenseValues, generatedText) => {
          const aggregates = buildPeriodAggregatedData(
            period,
            incomes(incomeValues),
            expenses(expenseValues),
            categories([false, false, false]),
          )
          const before = structuredClone(aggregates)
          const providers: AIInsightsProvider[] = [
            providerReturning(generatedText),
            providerReturning(`Distinto: ${generatedText}`),
            providerFailing(),
          ]
          for (const provider of providers) {
            await new GeneratePeriodSummary(provider)
              .execute(aggregates)
              .catch(() => undefined)
            expect(aggregates).toEqual(before)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

function providerReturning(text: string): AIInsightsProvider {
  return {
    suggestCategory: async () => null,
    generatePeriodSummary: async () => ({ text, highlights: [] }),
    explainCategoryChanges: async () => [],
  }
}

function providerFailing(): AIInsightsProvider {
  const unavailable = async () => {
    throw new Error('AIUnavailable')
  }
  return {
    suggestCategory: unavailable,
    generatePeriodSummary: unavailable,
    explainCategoryChanges: unavailable,
  }
}
