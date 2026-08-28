import { describe, expect, it } from 'vitest'
import type { DateOnly } from '@domain/value-objects'
import { derivePeriodEndDate } from './period-end-date'

describe('derivePeriodEndDate', () => {
  it.each([
    ['2026-09-01', '2026-09-30'],
    ['2026-01-01', '2026-01-31'],
    ['2026-02-01', '2026-02-28'],
    ['2024-02-01', '2024-02-29'],
    ['2026-04-01', '2026-04-30'],
    ['2026-03-01', '2026-03-31'],
    ['2026-12-15', '2027-01-14'],
    ['2026-01-31', '2026-02-27'],
    ['2024-01-31', '2024-02-28'],
  ] satisfies ReadonlyArray<readonly [DateOnly, DateOnly]>)(
    'calcula el final mensual inclusivo de %s como %s',
    (startDate, expectedEndDate) => {
      expect(derivePeriodEndDate('monthly', startDate)).toBe(expectedEndDate)
    },
  )

  it.each([
    ['2026-08-01', '2026-08-15'],
    ['2026-08-20', '2026-09-03'],
    ['2026-12-20', '2027-01-03'],
    ['2024-02-20', '2024-03-05'],
  ] satisfies ReadonlyArray<readonly [DateOnly, DateOnly]>)(
    'calcula el final quincenal inclusivo de %s como %s',
    (startDate, expectedEndDate) => {
      expect(derivePeriodEndDate('biweekly', startDate)).toBe(expectedEndDate)
    },
  )
})
