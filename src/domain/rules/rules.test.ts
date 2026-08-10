import { describe, expect, it } from 'vitest'
import {
  areCategoryNamesEquivalent,
  generateRecurringOccurrenceDates,
  periodsOverlap,
} from './index'

describe('reglas de dominio', () => {
  it('considera inclusivos los límites de periodos', () =>
    expect(
      periodsOverlap('2026-01-01', '2026-01-15', '2026-01-15', '2026-01-31'),
    ).toBe(true))
  it('normaliza nombres de categorías', () =>
    expect(areCategoryNamesEquivalent(' Comida ', 'comida')).toBe(true))
  it('genera ocurrencias semanales dentro del periodo', () =>
    expect(
      generateRecurringOccurrenceDates(
        'weekly',
        '2026-01-01',
        '2026-01-05',
        '2026-01-31',
      ),
    ).toEqual(['2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']))
  it('ajusta el día 31 al último día de febrero', () =>
    expect(
      generateRecurringOccurrenceDates(
        'monthly',
        '2026-01-31',
        '2026-02-01',
        '2026-02-28',
      ),
    ).toEqual(['2026-02-28']))
})
