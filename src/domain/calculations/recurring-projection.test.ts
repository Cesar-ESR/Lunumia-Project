import type { RecurringPayment } from '@domain/entities'
import { describe, expect, it } from 'vitest'

import { projectRecurringPaymentsForRange } from './recurring-projection'

const instant = '2026-08-01T00:00:00.000Z'
const payment = (
  overrides: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id: 'payment-a',
  ownerId: 'owner-a',
  name: 'Payment',
  amount: 123,
  frequency: 'monthly',
  dueDate: '2026-01-31',
  endDate: null,
  categoryId: 'category-a',
  status: 'active',
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

describe('projectRecurringPaymentsForRange', () => {
  it('returns no projections for an empty or inverted range', () => {
    expect(
      projectRecurringPaymentsForRange({
        recurringPayments: [],
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }),
    ).toEqual([])
    expect(
      projectRecurringPaymentsForRange({
        recurringPayments: [payment()],
        startDate: '2026-02-01',
        endDate: '2026-01-31',
      }),
    ).toEqual([])
  })

  it('projects a single monthly payment and preserves its current amount', () => {
    expect(
      projectRecurringPaymentsForRange({
        recurringPayments: [payment()],
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      }),
    ).toEqual([
      {
        recurringPaymentId: 'payment-a',
        dueDate: '2026-02-28',
        amount: 123,
      },
    ])
  })

  it.each([
    ['weekly', ['2026-08-01', '2026-08-08', '2026-08-15']],
    ['biweekly', ['2026-08-01', '2026-08-15']],
    ['monthly', ['2026-08-01']],
  ] as const)('reuses the %s cadence', (frequency, expectedDates) => {
    const result = projectRecurringPaymentsForRange({
      recurringPayments: [payment({ frequency, dueDate: '2026-08-01' })],
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    })

    expect(result.map(({ dueDate }) => dueDate)).toEqual(expectedDates)
  })

  it('uses inclusive range limits', () => {
    const result = projectRecurringPaymentsForRange({
      recurringPayments: [
        payment({ id: 'start', dueDate: '2026-08-01' }),
        payment({ id: 'end', dueDate: '2026-08-31' }),
      ],
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })

    expect(result.map(({ dueDate }) => dueDate)).toEqual([
      '2026-08-01',
      '2026-08-31',
    ])
  })

  it('respects rule start, end, inactive state, and tombstones', () => {
    const result = projectRecurringPaymentsForRange({
      recurringPayments: [
        payment({ id: 'future', dueDate: '2026-09-01' }),
        payment({ id: 'ended', dueDate: '2026-07-01', endDate: '2026-07-31' }),
        payment({ id: 'inactive', dueDate: '2026-08-01', status: 'inactive' }),
        payment({ id: 'deleted', dueDate: '2026-08-01', deletedAt: instant }),
        payment({
          id: 'bounded',
          frequency: 'weekly',
          dueDate: '2026-08-01',
          endDate: '2026-08-08',
        }),
      ],
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })

    expect(
      result.map(({ recurringPaymentId, dueDate }) => [
        recurringPaymentId,
        dueDate,
      ]),
    ).toEqual([
      ['bounded', '2026-08-01'],
      ['bounded', '2026-08-08'],
    ])
  })

  it('returns disposable projections rather than persisted occurrences', () => {
    const [projection] = projectRecurringPaymentsForRange({
      recurringPayments: [payment()],
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    })

    expect(projection).not.toHaveProperty('id')
    expect(projection).not.toHaveProperty('periodId')
    expect(projection).not.toHaveProperty('status')
    expect(projection).not.toHaveProperty('transactionId')
  })

  it('does not mutate rules or their order', () => {
    const recurringPayments = [
      payment({ id: 'later', dueDate: '2026-08-20' }),
      payment({ id: 'earlier', dueDate: '2026-08-10' }),
    ]
    const before = structuredClone(recurringPayments)

    projectRecurringPaymentsForRange({
      recurringPayments,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })

    expect(recurringPayments).toEqual(before)
  })
})
