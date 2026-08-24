import { describe, expect, it } from 'vitest'
import type {
  BalanceAnchor,
  Expense,
  ExpenseV2,
  IncomeV2,
} from '@domain/entities'
import { getResourceUsageSummary } from './GetResourceUsageSummary'

const cutoff = '2026-08-10T00:00:00.000Z'
const afterCutoff = '2026-08-11T00:00:00.000Z'
const beforeCutoff = '2026-08-09T00:00:00.000Z'
const base = {
  ownerId: 'owner',
  createdAt: cutoff,
  updatedAt: cutoff,
  deletedAt: null,
  syncStatus: 'synced' as const,
}

const anchor = (
  amount = 400_000,
  overrides: Partial<BalanceAnchor> = {},
): BalanceAnchor => ({
  ...base,
  id: 'anchor',
  amount,
  capturedAt: cutoff,
  ledgerCutoffAt: cutoff,
  ...overrides,
})

const expense = (
  amount: number,
  overrides: Partial<ExpenseV2> = {},
): ExpenseV2 => ({
  ...base,
  id: `expense-${amount}`,
  periodId: 'period',
  categoryId: 'category',
  amount,
  description: 'Gasto',
  date: '2026-08-11',
  recurringOccurrenceId: null,
  affectsBalance: true,
  balanceEffectiveAt: afterCutoff,
  ...overrides,
})

const income = (
  amount: number,
  overrides: Partial<IncomeV2> = {},
): IncomeV2 => ({
  ...base,
  id: `income-${amount}`,
  periodId: 'period',
  amount,
  description: 'Ingreso',
  date: '2026-08-11',
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: afterCutoff,
  ...overrides,
})

describe('getResourceUsageSummary', () => {
  it('devuelve unknown cuando no existe una referencia de saldo', () => {
    expect(
      getResourceUsageSummary({ anchor: null, incomes: [], expenses: [] }),
    ).toBeNull()
  })

  it('deriva base y disponibilidad desde el balance autoritativo', () => {
    expect(
      getResourceUsageSummary({
        anchor: anchor(),
        incomes: [],
        expenses: [expense(120_000)],
      }),
    ).toEqual({
      referenceAt: cutoff,
      resourceBaseCents: 400_000,
      spentCents: 120_000,
      currentAvailableCents: 280_000,
      canCalculatePercentage: true,
      status: 'available',
    })
  })

  it('excluye gasto histórico, previo, igual al corte y tombstone', () => {
    const expenses = [
      expense(10_000, { id: 'historical', affectsBalance: false }),
      expense(20_000, {
        id: 'before',
        balanceEffectiveAt: beforeCutoff,
      }),
      expense(30_000, { id: 'equal', balanceEffectiveAt: cutoff }),
      expense(40_000, { id: 'deleted', deletedAt: afterCutoff }),
      expense(50_000, { id: 'effective' }),
    ]

    expect(
      getResourceUsageSummary({ anchor: anchor(), incomes: [], expenses }),
    ).toMatchObject({
      spentCents: 50_000,
      currentAvailableCents: 350_000,
      resourceBaseCents: 400_000,
    })
  })

  it('incluye ingreso recibido efectivo una vez y excluye dinero esperado', () => {
    const incomes = [
      income(100_000),
      income(900_000, {
        id: 'expected',
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
      income(800_000, {
        id: 'cancelled',
        status: 'cancelled',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
    ]

    expect(
      getResourceUsageSummary({
        anchor: anchor(300_000),
        incomes,
        expenses: [expense(120_000)],
      }),
    ).toMatchObject({
      resourceBaseCents: 400_000,
      spentCents: 120_000,
      currentAvailableCents: 280_000,
    })
  })

  it('cuenta una ocurrencia pagada únicamente mediante su Expense vinculada', () => {
    expect(
      getResourceUsageSummary({
        anchor: anchor(),
        incomes: [],
        expenses: [
          expense(75_000, { recurringOccurrenceId: 'occurrence-paid' }),
        ],
      }),
    ).toMatchObject({ spentCents: 75_000, currentAvailableCents: 325_000 })
  })

  it('rebasa la ventana al corte del anchor más reciente', () => {
    const latestCutoff = '2026-08-20T00:00:00.000Z'

    expect(
      getResourceUsageSummary({
        anchor: anchor(200_000, {
          capturedAt: latestCutoff,
          ledgerCutoffAt: latestCutoff,
        }),
        incomes: [],
        expenses: [
          expense(90_000, { id: 'old' }),
          expense(50_000, {
            id: 'new',
            balanceEffectiveAt: '2026-08-21T00:00:00.000Z',
          }),
        ],
      }),
    ).toMatchObject({
      referenceAt: latestCutoff,
      resourceBaseCents: 200_000,
      spentCents: 50_000,
      currentAvailableCents: 150_000,
    })
  })

  it('preserva disponibilidad negativa y una base positiva', () => {
    expect(
      getResourceUsageSummary({
        anchor: anchor(100_000),
        incomes: [],
        expenses: [expense(125_000)],
      }),
    ).toMatchObject({
      resourceBaseCents: 100_000,
      spentCents: 125_000,
      currentAvailableCents: -25_000,
      canCalculatePercentage: true,
      status: 'negative',
    })
  })

  it('preserva base cero y omite autoridad porcentual', () => {
    expect(
      getResourceUsageSummary({
        anchor: anchor(0),
        incomes: [],
        expenses: [expense(50_000)],
      }),
    ).toMatchObject({
      resourceBaseCents: 0,
      spentCents: 50_000,
      currentAvailableCents: -50_000,
      canCalculatePercentage: false,
      status: 'negative',
    })
  })

  it('mantiene el límite legacy basado en createdAt', () => {
    const legacyAfter: Expense = {
      ...base,
      id: 'legacy-after',
      periodId: 'period',
      categoryId: 'category',
      amount: 30_000,
      description: 'Gasto legacy',
      date: '2026-08-11',
      recurringOccurrenceId: null,
      createdAt: afterCutoff,
    }
    const legacyBefore: Expense = {
      ...legacyAfter,
      id: 'legacy-before',
      amount: 90_000,
      createdAt: beforeCutoff,
    }

    expect(
      getResourceUsageSummary({
        anchor: anchor(),
        incomes: [],
        expenses: [legacyBefore, legacyAfter],
      }),
    ).toMatchObject({ spentCents: 30_000 })
  })
})
