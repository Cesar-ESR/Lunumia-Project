import { formatMoney } from './money'

describe('formatMoney', () => {
  it.each([
    [700_000, '$7,000.00'],
    [21_300, '$213.00'],
    [14_000, '$140.00'],
    [7_300, '$73.00'],
    [12_000, '$120.00'],
    [5_000, '$50.00'],
    [2_300, '$23.00'],
    [2_000, '$20.00'],
  ])('formatea %i centavos como %s en MXN', (amount, expected) => {
    expect(formatMoney(amount, 'MXN')).toBe(expected)
  })
})
