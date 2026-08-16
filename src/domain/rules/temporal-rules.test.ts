import type {
  IncomeV2,
  Period,
  RecurringPaymentOccurrenceV2,
} from '@domain/entities'
import { CurrentPeriodConflictError } from '@domain/errors'
import { describe, expect, it } from 'vitest'

import {
  getPeriodTemporalState,
  isExpectedIncomeOverdue,
  isOccurrenceOverdue,
  isPeriodAnalyzable,
  resolveCurrentPeriod,
} from './index'

const period = (overrides: Partial<Period> = {}): Period => ({
  id: 'period-a',
  ownerId: 'owner-a',
  type: 'monthly',
  startDate: '2026-08-10',
  endDate: '2026-08-20',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
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
  periodId: 'period-a',
  dueDate: '2026-08-14',
  status: 'pending',
  amount: 100_00,
  transactionId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

const income = (overrides: Partial<IncomeV2> = {}): IncomeV2 => ({
  id: 'income-a',
  ownerId: 'owner-a',
  periodId: 'period-a',
  amount: 1_000_00,
  description: 'Nómina',
  date: '2026-08-14',
  status: 'expected',
  affectsBalance: true,
  balanceEffectiveAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
})

describe('getPeriodTemporalState', () => {
  it.each([
    ['2026-08-09', 'future'],
    ['2026-08-10', 'active'],
    ['2026-08-15', 'active'],
    ['2026-08-20', 'active'],
    ['2026-08-21', 'ended'],
  ] as const)('clasifica %s como %s', (today, expected) => {
    expect(getPeriodTemporalState(period(), today)).toBe(expected)
  })
})

describe('resolveCurrentPeriod', () => {
  it('devuelve null cuando no hay periodos', () => {
    expect(resolveCurrentPeriod([], '2026-08-15')).toBeNull()
  })

  it('devuelve null cuando solo existe un periodo futuro', () => {
    expect(
      resolveCurrentPeriod(
        [period({ startDate: '2026-09-01', endDate: '2026-09-30' })],
        '2026-08-15',
      ),
    ).toBeNull()
  })

  it('devuelve null cuando solo existe un periodo terminado', () => {
    expect(
      resolveCurrentPeriod(
        [period({ startDate: '2026-07-01', endDate: '2026-07-31' })],
        '2026-08-15',
      ),
    ).toBeNull()
  })

  it('selecciona por fecha el único periodo que contiene hoy', () => {
    const current = period()
    expect(resolveCurrentPeriod([current], '2026-08-15')).toBe(current)
  })

  it.each(['2026-08-10', '2026-08-20'] as const)(
    'incluye el límite %s',
    (today) => {
      const current = period()
      expect(resolveCurrentPeriod([current], today)).toBe(current)
    },
  )

  it('ignora un periodo tombstone aunque contenga hoy', () => {
    expect(
      resolveCurrentPeriod(
        [period({ deletedAt: '2026-08-12T00:00:00.000Z' })],
        '2026-08-15',
      ),
    ).toBeNull()
  })

  it('selecciona el periodo real cuando otro candidato es tombstone', () => {
    const current = period({ id: 'current' })
    const deleted = period({
      id: 'deleted',
      deletedAt: '2026-08-12T00:00:00.000Z',
    })
    expect(resolveCurrentPeriod([deleted, current], '2026-08-15')).toBe(current)
  })

  it('lanza CurrentPeriodConflictError para múltiples candidatos activos', () => {
    const resolve = () =>
      resolveCurrentPeriod(
        [period({ id: 'period-a' }), period({ id: 'period-b' })],
        '2026-08-15',
      )

    expect(resolve).toThrow(CurrentPeriodConflictError)
    expect(resolve).toThrowError(/más de un periodo actual/i)
  })
})

describe('isOccurrenceOverdue', () => {
  it.each([
    ['pending', '2026-08-14', null, true],
    ['pending', '2026-08-15', null, false],
    ['pending', '2026-08-16', null, false],
    ['paid', '2026-08-14', null, false],
    ['skipped', '2026-08-14', null, false],
    ['pending', '2026-08-14', '2026-08-15T00:00:00.000Z', false],
  ] as const)(
    'status=%s, dueDate=%s, deletedAt=%s produce %s',
    (status, dueDate, deletedAt, expected) => {
      expect(
        isOccurrenceOverdue(
          occurrence({ status, dueDate, deletedAt }),
          '2026-08-15',
        ),
      ).toBe(expected)
    },
  )
})

describe('isExpectedIncomeOverdue', () => {
  it.each([
    ['expected', '2026-08-14', null, true],
    ['expected', '2026-08-15', null, false],
    ['expected', '2026-08-16', null, false],
    ['received', '2026-08-14', null, false],
    ['cancelled', '2026-08-14', null, false],
    ['expected', '2026-08-14', '2026-08-15T00:00:00.000Z', false],
  ] as const)(
    'status=%s, date=%s, deletedAt=%s produce %s',
    (status, date, deletedAt, expected) => {
      expect(
        isExpectedIncomeOverdue(
          income({ status, date, deletedAt }),
          '2026-08-15',
        ),
      ).toBe(expected)
    },
  )
})

describe('isPeriodAnalyzable', () => {
  const today = '2026-08-21'
  const ended = period()

  it('rechaza un periodo futuro aunque no tenga occurrences', () => {
    expect(
      isPeriodAnalyzable(
        period({ startDate: '2026-09-01', endDate: '2026-09-30' }),
        [],
        today,
      ),
    ).toBe(false)
  })

  it('rechaza un periodo activo aunque no tenga occurrences', () => {
    expect(
      isPeriodAnalyzable(period({ endDate: '2026-08-25' }), [], today),
    ).toBe(false)
  })

  it('acepta un periodo terminado sin occurrences', () => {
    expect(isPeriodAnalyzable(ended, [], today)).toBe(true)
  })

  it.each(['paid', 'skipped'] as const)(
    'acepta un periodo terminado con una occurrence %s',
    (status) => {
      expect(isPeriodAnalyzable(ended, [occurrence({ status })], today)).toBe(
        true,
      )
    },
  )

  it('acepta paid y skipped combinadas', () => {
    expect(
      isPeriodAnalyzable(
        ended,
        [
          occurrence({ id: 'paid', status: 'paid' }),
          occurrence({ id: 'skipped', status: 'skipped' }),
        ],
        today,
      ),
    ).toBe(true)
  })

  it('rechaza un periodo terminado con una occurrence pending activa', () => {
    expect(isPeriodAnalyzable(ended, [occurrence()], today)).toBe(false)
  })

  it('ignora una occurrence pending de otro periodo', () => {
    expect(
      isPeriodAnalyzable(ended, [occurrence({ periodId: 'period-b' })], today),
    ).toBe(true)
  })

  it('ignora una occurrence pending tombstone del mismo periodo', () => {
    expect(
      isPeriodAnalyzable(
        ended,
        [occurrence({ deletedAt: '2026-08-20T00:00:00.000Z' })],
        today,
      ),
    ).toBe(true)
  })

  it('acepta la combinación sin pending activo del periodo objetivo', () => {
    expect(
      isPeriodAnalyzable(
        ended,
        [
          occurrence({ id: 'paid', status: 'paid' }),
          occurrence({ id: 'skipped', status: 'skipped' }),
          occurrence({
            id: 'deleted',
            deletedAt: '2026-08-20T00:00:00.000Z',
          }),
          occurrence({ id: 'other', periodId: 'period-b' }),
        ],
        today,
      ),
    ).toBe(true)
  })
})
