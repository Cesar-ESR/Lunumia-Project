/** Diagnostic metadata only. Never returns input content or normalizes money. */
export function classifyMoneyFormat(value: unknown) {
  const receivedType =
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  const text = typeof value === 'string' ? value : ''
  const trimmed = text.trim()
  const hasCurrencySymbol = /\p{Sc}/u.test(text)
  const hasThousandsComma = /\d{1,3}(?:,\d{3})+(?:\.|$)/.test(trimmed)
  const hasThousandsSpace =
    /\d[ \u00a0\u202f]\d{3}(?:[ \u00a0\u202f]\d{3})*(?:[.,]|$)/.test(trimmed)
  const hasDecimalPoint = /\.\d/.test(text)
  const hasDecimalComma = !hasThousandsComma && /,\d/.test(text)
  const decimal = hasDecimalPoint
    ? /\.(\d+)/.exec(text)
    : hasDecimalComma
      ? /,(\d+)/.exec(text)
      : null
  const hasLeadingOrTrailingWhitespace = text !== trimmed
  let patternClass = 'OTHER'
  if (typeof value === 'number') patternClass = 'NUMBER_INSTEAD_OF_STRING'
  else if (typeof value === 'string') {
    if (!text.length) patternClass = 'EMPTY_STRING'
    else if (/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text))
      patternClass = 'CANONICAL_DECIMAL'
    else if (hasLeadingOrTrailingWhitespace) patternClass = 'WHITESPACE_WRAPPED'
    else if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(trimmed))
      patternClass = 'SCIENTIFIC_NOTATION'
    else if (/^-?\p{Sc}/u.test(trimmed)) patternClass = 'CURRENCY_SYMBOL_PREFIX'
    else if (/^[A-Z]{3}\s*[-\d]/.test(trimmed))
      patternClass = 'CURRENCY_CODE_PREFIX'
    else if (/\d\s*[A-Z]{3}$/.test(trimmed))
      patternClass = 'CURRENCY_CODE_SUFFIX'
    else if (hasThousandsComma) patternClass = 'THOUSANDS_COMMA'
    else if (hasThousandsSpace) patternClass = 'THOUSANDS_SPACE'
    else if (hasDecimalComma) patternClass = 'DECIMAL_COMMA'
  }
  return {
    receivedType,
    ...(typeof value === 'string' ? { stringLength: text.length } : {}),
    patternClass,
    hasLeadingOrTrailingWhitespace,
    hasCurrencySymbol,
    hasThousandsSeparator: hasThousandsComma || hasThousandsSpace,
    hasDecimalPoint,
    hasDecimalComma,
    decimalDigitCount: decimal?.[1]?.length ?? null,
    isNegative: typeof value === 'number' ? value < 0 : /^-/.test(trimmed),
  }
}
