import { describe, expect, it } from 'vitest'
import {
  createAmountCents,
  createDateOnly,
  createInstant,
  createSignedMoneyCents,
  isAmountCents,
  isDateOnly,
} from './index'

describe('value objects', () => {
  it('acepta solo centavos enteros no negativos', () => {
    expect(createAmountCents(0)).toBe(0)
    expect(isAmountCents(12.5)).toBe(false)
    expect(() => createAmountCents(-1)).toThrow()
  })
  it('acepta dinero con signo entero', () => {
    expect(createSignedMoneyCents(-25)).toBe(-25)
    expect(() => createSignedMoneyCents(Number.NaN)).toThrow()
  })
  it('valida fechas reales e incluye años bisiestos', () => {
    expect(createDateOnly('2024-02-29')).toBe('2024-02-29')
    expect(isDateOnly('2026-02-29')).toBe(false)
    expect(() => createDateOnly('2026-02-30')).toThrow()
  })
  it('valida instantes UTC ISO', () =>
    expect(createInstant('2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    ))
})
