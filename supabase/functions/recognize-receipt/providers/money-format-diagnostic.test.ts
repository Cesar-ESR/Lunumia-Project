import { classifyMoneyFormat } from './money-format-diagnostic'

it.each([
  ['123.45', 'CANONICAL_DECIMAL'],
  [' 123.45 ', 'WHITESPACE_WRAPPED'],
  ['$123.45', 'CURRENCY_SYMBOL_PREFIX'],
  ['MXN 123.45', 'CURRENCY_CODE_PREFIX'],
  ['123.45 MXN', 'CURRENCY_CODE_SUFFIX'],
  ['1,234.56', 'THOUSANDS_COMMA'],
  ['1 234.56', 'THOUSANDS_SPACE'],
  ['123,45', 'DECIMAL_COMMA'],
  [123.45, 'NUMBER_INSTEAD_OF_STRING'],
  ['1.23e2', 'SCIENTIFIC_NOTATION'],
  ['', 'EMPTY_STRING'],
  ['private-reference', 'OTHER'],
])('classifies without returning the input %#', (input, patternClass) => {
  const result = classifyMoneyFormat(input)
  expect(result.patternClass).toBe(patternClass)
  expect(JSON.stringify(result)).not.toContain('123')
  expect(JSON.stringify(result)).not.toContain('private-reference')
})

it('reports structural flags for comma grouping', () => {
  expect(classifyMoneyFormat('-1,234.56')).toMatchObject({
    receivedType: 'string',
    stringLength: 9,
    patternClass: 'THOUSANDS_COMMA',
    hasThousandsSeparator: true,
    hasDecimalPoint: true,
    hasDecimalComma: false,
    decimalDigitCount: 2,
    isNegative: true,
    hasCurrencySymbol: false,
    hasLeadingOrTrailingWhitespace: false,
  })
})
