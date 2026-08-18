import type {
  BalanceAnchor,
  ExpenseV2,
  IncomeV2,
  Period,
  RecurringPaymentOccurrenceV2,
} from '@domain/entities'
import { describe, expect, it } from 'vitest'

import { calculateFinancialSnapshot } from './financial-snapshot'

const instant = '2026-08-10T12:00:00.000Z'
const cutoff = '2026-08-15T12:00:00.000Z'
const afterCutoff = '2026-08-15T12:00:00.001Z'
const deletedAt = '2026-08-16T00:00:00.000Z'

const period = (overrides: Partial<Period> = {}): Period => ({
  id: 'period-current',
  ownerId: 'owner-a',
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const anchor = (overrides: Partial<BalanceAnchor> = {}): BalanceAnchor => ({
  id: 'anchor-a',
  ownerId: 'owner-a',
  amount: 1_000,
  capturedAt: cutoff,
  ledgerCutoffAt: cutoff,
  createdAt: cutoff,
  updatedAt: cutoff,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const income = (overrides: Partial<IncomeV2> = {}): IncomeV2 => ({
  id: 'income-a',
  ownerId: 'owner-a',
  periodId: 'period-current',
  amount: 100,
  description: 'Ingreso',
  date: '2026-08-20',
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: afterCutoff,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const expense = (overrides: Partial<ExpenseV2> = {}): ExpenseV2 => ({
  id: 'expense-a',
  ownerId: 'owner-a',
  periodId: 'period-current',
  categoryId: 'category-a',
  amount: 100,
  description: 'Gasto',
  date: '2026-08-20',
  recurringOccurrenceId: null,
  affectsBalance: true,
  balanceEffectiveAt: afterCutoff,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const occurrence = (
  overrides: Partial<RecurringPaymentOccurrenceV2> = {},
): RecurringPaymentOccurrenceV2 => ({
  id: 'occurrence-a',
  ownerId: 'owner-a',
  recurringPaymentId: 'payment-a',
  periodId: 'period-current',
  dueDate: '2026-08-20',
  status: 'pending',
  amount: 100,
  transactionId: null,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const snapshot = (
  overrides: Partial<Parameters<typeof calculateFinancialSnapshot>[0]> = {},
) =>
  calculateFinancialSnapshot({
    today: '2026-08-15',
    currentPeriod: period(),
    anchor: anchor(),
    incomes: [],
    expenses: [],
    occurrences: [],
    ...overrides,
  })

describe('calculateFinancialSnapshot', () => {
  it('keeps balance-derived projections unknown without an anchor', () => {
    expect(snapshot({ anchor: null })).toMatchObject({
      currentBalanceCents: null,
      projectedAvailableCents: null,
      projectedClosingBalanceCents: null,
    })
  })

  it.each([
    [2_000, 2_000],
    [0, 0],
    [-2_000, -2_000],
  ])('accepts a signed anchor of %i cents', (amount, expected) => {
    expect(snapshot({ anchor: anchor({ amount }) }).currentBalanceCents).toBe(
      expected,
    )
  })

  it('uses only effective received movements strictly after the cutoff', () => {
    const incomes = [
      income({ id: 'before', balanceEffectiveAt: instant, amount: 1 }),
      income({ id: 'equal', balanceEffectiveAt: cutoff, amount: 10 }),
      income({ id: 'after', balanceEffectiveAt: afterCutoff, amount: 100 }),
      income({
        id: 'expected',
        status: 'expected',
        balanceEffectiveAt: null,
        amount: 1_000,
      }),
      income({
        id: 'cancelled',
        status: 'cancelled',
        balanceEffectiveAt: null,
        amount: 10_000,
      }),
      income({ id: 'historical', affectsBalance: false, amount: 100_000 }),
    ]
    const expenses = [
      expense({ id: 'before', balanceEffectiveAt: instant, amount: 2 }),
      expense({ id: 'equal', balanceEffectiveAt: cutoff, amount: 20 }),
      expense({ id: 'after', balanceEffectiveAt: afterCutoff, amount: 40 }),
      expense({ id: 'historical', affectsBalance: false, amount: 400 }),
    ]

    expect(snapshot({ incomes, expenses }).currentBalanceCents).toBe(1_060)
  })

  it('counts a historical expense as spent without changing current balance', () => {
    const historical = expense({ amount: 250, affectsBalance: false })

    expect(snapshot({ expenses: [historical] })).toMatchObject({
      currentBalanceCents: 1_000,
      spentCents: 250,
    })
  })

  it('separates overdue, inclusive upcoming, and excluded commitments', () => {
    const occurrences = [
      occurrence({
        id: 'previous-overdue',
        periodId: 'old',
        dueDate: '2026-08-14',
        amount: 100,
      }),
      occurrence({ id: 'today', dueDate: '2026-08-15', amount: 200 }),
      occurrence({ id: 'end', dueDate: '2026-08-31', amount: 300 }),
      occurrence({ id: 'after', dueDate: '2026-09-01', amount: 400 }),
      occurrence({
        id: 'paid',
        dueDate: '2026-08-20',
        status: 'paid',
        amount: 500,
      }),
      occurrence({
        id: 'skipped',
        dueDate: '2026-08-20',
        status: 'skipped',
        amount: 600,
      }),
      occurrence({
        id: 'deleted',
        dueDate: '2026-08-20',
        deletedAt,
        amount: 700,
      }),
    ]

    expect(snapshot({ occurrences })).toMatchObject({
      overdueCommittedCents: 100,
      upcomingCommittedCents: 500,
      committedCents: 600,
      projectedAvailableCents: 400,
    })
  })

  it('rejects an active legacy commitment without inventing its amount', () => {
    const { amount, ...legacyOccurrence } = occurrence()

    expect(amount).toBe(100)
    expect(() => snapshot({ occurrences: [legacyOccurrence] })).toThrowError(
      /snapshot de monto/i,
    )
  })

  it('separates expected income by status and horizon boundaries', () => {
    const incomes = [
      income({
        id: 'overdue',
        status: 'expected',
        balanceEffectiveAt: null,
        date: '2026-08-14',
        amount: 10,
      }),
      income({
        id: 'today',
        status: 'expected',
        balanceEffectiveAt: null,
        date: '2026-08-15',
        amount: 20,
      }),
      income({
        id: 'inside',
        status: 'expected',
        balanceEffectiveAt: null,
        date: '2026-08-20',
        amount: 30,
      }),
      income({
        id: 'end',
        status: 'expected',
        balanceEffectiveAt: null,
        date: '2026-08-31',
        amount: 40,
      }),
      income({
        id: 'after',
        status: 'expected',
        balanceEffectiveAt: null,
        date: '2026-09-01',
        amount: 50,
      }),
      income({ id: 'received', status: 'received', amount: 60 }),
      income({
        id: 'cancelled',
        status: 'cancelled',
        balanceEffectiveAt: null,
        amount: 70,
      }),
      income({
        id: 'deleted',
        status: 'expected',
        balanceEffectiveAt: null,
        amount: 80,
        deletedAt,
      }),
    ]

    expect(snapshot({ incomes })).toMatchObject({
      expectedIncomeCents: 90,
      overdueExpectedIncomeCents: 10,
      projectedClosingBalanceCents: 1_150,
    })
  })

  it('provides overdue-only coverage without a current period', () => {
    const result = snapshot({
      currentPeriod: null,
      incomes: [
        income({
          status: 'expected',
          balanceEffectiveAt: null,
          date: '2026-08-14',
          amount: 50,
        }),
        income({
          id: 'today',
          status: 'expected',
          balanceEffectiveAt: null,
          date: '2026-08-15',
          amount: 60,
        }),
      ],
      expenses: [expense({ amount: 900 })],
      occurrences: [
        occurrence({ dueDate: '2026-08-14', amount: 200 }),
        occurrence({ id: 'today', dueDate: '2026-08-15', amount: 300 }),
      ],
    })

    expect(result).toMatchObject({
      spentCents: 0,
      overdueCommittedCents: 200,
      upcomingCommittedCents: 0,
      committedCents: 200,
      expectedIncomeCents: 0,
      overdueExpectedIncomeCents: 50,
      projectedAvailableCents: -100,
      projectedClosingBalanceCents: -100,
      projectionHorizonEnd: null,
      projectionCoverage: 'overdue_only',
    })
  })

  it('ignores tombstones across all financial inputs', () => {
    expect(
      snapshot({
        incomes: [
          income({ amount: 500, deletedAt }),
          income({
            id: 'expected',
            status: 'expected',
            balanceEffectiveAt: null,
            deletedAt,
          }),
        ],
        expenses: [expense({ amount: 500, deletedAt })],
        occurrences: [occurrence({ amount: 500, deletedAt })],
      }),
    ).toEqual({
      currentBalanceCents: 1_000,
      spentCents: 0,
      committedCents: 0,
      upcomingCommittedCents: 0,
      overdueCommittedCents: 0,
      projectedAvailableCents: 1_000,
      expectedIncomeCents: 0,
      overdueExpectedIncomeCents: 0,
      projectedClosingBalanceCents: 1_000,
      projectionHorizonEnd: '2026-08-31',
      projectionCoverage: 'full_period',
    })
  })

  it('treats a deleted current period as no current period', () => {
    expect(snapshot({ currentPeriod: period({ deletedAt }) })).toMatchObject({
      spentCents: 0,
      upcomingCommittedCents: 0,
      expectedIncomeCents: 0,
      projectionHorizonEnd: null,
      projectionCoverage: 'overdue_only',
    })
  })

  it('does not mutate any input', () => {
    const input = {
      today: '2026-08-15',
      currentPeriod: period(),
      anchor: anchor(),
      incomes: [income()],
      expenses: [expense()],
      occurrences: [occurrence()],
    } as const
    const before = structuredClone(input)

    calculateFinancialSnapshot(input)

    expect(input).toEqual(before)
  })

  it('preserves integer-cent arithmetic for large safe aggregates', () => {
    const amount = 1_000_000_000_001
    const result = snapshot({
      anchor: anchor({ amount: -1 }),
      incomes: [income({ amount })],
      expenses: [expense({ amount: 1 })],
    })

    expect(result.currentBalanceCents).toBe(999_999_999_999)
    expect(Number.isInteger(result.currentBalanceCents)).toBe(true)
  })
})
