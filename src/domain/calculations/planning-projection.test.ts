import type { IncomeV2, Period, RecurringPayment } from '@domain/entities'
import { describe, expect, it } from 'vitest'

import { calculatePlanningProjection } from './planning-projection'

const instant = '2026-08-01T00:00:00.000Z'
const deletedAt = '2026-08-02T00:00:00.000Z'

const period = (overrides: Partial<Period> = {}): Period => ({
  id: 'future-period',
  ownerId: 'owner-a',
  type: 'monthly',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const income = (overrides: Partial<IncomeV2> = {}): IncomeV2 => ({
  id: 'income-a',
  ownerId: 'owner-a',
  periodId: 'future-period',
  amount: 500,
  description: 'Expected',
  date: '2026-09-10',
  status: 'expected',
  affectsBalance: false,
  balanceEffectiveAt: null,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const payment = (
  overrides: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id: 'payment-a',
  ownerId: 'owner-a',
  name: 'Subscription',
  amount: 300,
  frequency: 'monthly',
  dueDate: '2026-08-15',
  endDate: null,
  categoryId: 'category-a',
  status: 'active',
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

describe('calculatePlanningProjection', () => {
  it('calculates expected income, recurring projection, and closing balance', () => {
    const result = calculatePlanningProjection({
      period: period(),
      projectedOpeningBalanceCents: 1_000,
      incomes: [
        income(),
        income({ id: 'cancelled', status: 'cancelled', amount: 5_000 }),
        income({
          id: 'received',
          status: 'received',
          balanceEffectiveAt: instant,
          amount: 5_000,
        }),
        income({ id: 'other', periodId: 'other', amount: 5_000 }),
        income({ id: 'deleted', deletedAt, amount: 5_000 }),
      ],
      recurringPayments: [payment()],
    })

    expect(result).toEqual({
      periodId: 'future-period',
      projectedOpeningBalanceCents: 1_000,
      expectedIncomeCents: 500,
      projectedRecurringPaymentsCents: 300,
      projectedClosingBalanceCents: 1_200,
    })
  })

  it('keeps closing balance unknown while still calculating components', () => {
    expect(
      calculatePlanningProjection({
        period: period(),
        projectedOpeningBalanceCents: null,
        incomes: [income()],
        recurringPayments: [payment()],
      }),
    ).toMatchObject({
      projectedOpeningBalanceCents: null,
      expectedIncomeCents: 500,
      projectedRecurringPaymentsCents: 300,
      projectedClosingBalanceCents: null,
    })
  })

  it.each([
    [100, 50, 50],
    [100, 100, 0],
    [100, 150, -50],
  ])(
    'allows a closing balance from %i minus %i to equal %i',
    (opening, recurringAmount, expectedClosing) => {
      const result = calculatePlanningProjection({
        period: period(),
        projectedOpeningBalanceCents: opening,
        incomes: [],
        recurringPayments: [payment({ amount: recurringAmount })],
      })

      expect(result.projectedClosingBalanceCents).toBe(expectedClosing)
    },
  )

  it('ignores a deleted target period as a projection horizon', () => {
    expect(
      calculatePlanningProjection({
        period: period({ deletedAt }),
        projectedOpeningBalanceCents: 100,
        incomes: [income()],
        recurringPayments: [payment()],
      }),
    ).toEqual({
      periodId: 'future-period',
      projectedOpeningBalanceCents: 100,
      expectedIncomeCents: 0,
      projectedRecurringPaymentsCents: 0,
      projectedClosingBalanceCents: 100,
    })
  })

  it('does not mutate its period, incomes, or recurring rules', () => {
    const input = {
      period: period(),
      projectedOpeningBalanceCents: 1_000,
      incomes: [income()],
      recurringPayments: [payment()],
    } as const
    const before = structuredClone(input)

    calculatePlanningProjection(input)

    expect(input).toEqual(before)
  })
})
