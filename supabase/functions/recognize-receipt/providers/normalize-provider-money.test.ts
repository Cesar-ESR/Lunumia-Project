import {
  normalizeProviderMoneyString,
  normalizeProviderMoneyFields,
} from './normalize-provider-money'
import { parseOCRDecimalCents } from './GroqVisionOCRProvider'

it.each([
  ['0', '0'],
  ['0.00', '0.00'],
  ['1006', '1006'],
  ['1006.00', '1006.00'],
  ['1,006', '1006'],
  ['1,006.00', '1006.00'],
  ['12,345.67', '12345.67'],
  ['999,999.99', '999999.99'],
  ['-1,006.00', '-1006.00'],
  [null, null],
  ['1,234,567.8', '1234567.8'],
])('normalizes only valid grouping %#', (input, expected) => {
  expect(normalizeProviderMoneyString(input)).toBe(expected)
})

const rejectedMoneyVariants = [
  '10,06.00',
  '1,00,6.00',
  '1,006.000',
  '1,006.',
  '$1,006.00',
  'MXN 1,006.00',
  '1 006.00',
  '1.006,00',
  '1006,00',
  '1e3',
  'NaN',
  'Infinity',
  1006,
  ' 1,006.00',
  '1,006.00 ',
  '01,006.00',
  '0,006.00',
  '+1,006.00',
  '1,006.00\n',
  '1,006.00\r\n',
]
it.each(rejectedMoneyVariants)(
  'does not repair unsupported formats %#',
  (input) => {
    expect(normalizeProviderMoneyString(input)).toBe(input)
  },
)

it('converts after lexical normalization without floating point parsing', () => {
  const value = normalizeProviderMoneyString('1,006.00')
  expect(typeof value).toBe('string')
  expect(parseOCRDecimalCents(value as string)).toBe(100600)
})

it('preserves extra and missing keys for strict validation and does not mutate', () => {
  const source = { total: '1,006.00', extra: true }
  expect(normalizeProviderMoneyFields(source)).toEqual({
    total: '1006.00',
    extra: true,
  })
  expect(source.total).toBe('1,006.00')
})
