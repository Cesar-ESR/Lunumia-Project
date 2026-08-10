import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateRecurringOccurrenceDates, periodsOverlap } from './index'

describe('propiedades de reglas de dominio', () => {
  it('P3: detecta periodos solapados', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 27 }),
        fc.integer({ min: 1, max: 27 }),
        (firstDay, secondDay) => {
          const start = `2026-01-${String(Math.min(firstDay, secondDay)).padStart(2, '0')}`
          const end = `2026-01-${String(Math.max(firstDay, secondDay)).padStart(2, '0')}`
          expect(periodsOverlap(start, end, start, end)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('P12: cada ocurrencia está dentro del periodo y en orden', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('weekly', 'biweekly', 'monthly'),
        (frequency) => {
          const dates = generateRecurringOccurrenceDates(
            frequency,
            '2026-01-31',
            '2026-02-01',
            '2026-04-30',
          )
          expect(
            dates.every((date) => date >= '2026-02-01' && date <= '2026-04-30'),
          ).toBe(true)
          expect(dates).toEqual([...dates].sort())
          expect(new Set(dates).size).toBe(dates.length)
        },
      ),
      { numRuns: 100 },
    )
  })
})
