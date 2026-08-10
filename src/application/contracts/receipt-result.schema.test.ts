import { describe, expect, it } from 'vitest'
import {
  InvalidOCRResponseError,
  MAX_RECEIPT_MERCHANT_LENGTH,
  MAX_RECEIPT_RAW_TEXT_LENGTH,
  parseReceiptRecognitionResult,
  ReceiptResultSchema,
} from './receipt-result.schema'

const valid = {
  merchant: 'Comercio',
  date: '2026-08-02',
  total: 12_345,
  currency: 'MXN',
  confidence: 0.95,
  rawText: 'TOTAL 123.45',
}

describe('ReceiptResultSchema', () => {
  it('acepta una respuesta OCR válida', () => {
    expect(ReceiptResultSchema.parse(valid)).toEqual(valid)
  })

  it('rechaza total decimal', () => {
    expect(
      ReceiptResultSchema.safeParse({ ...valid, total: 12.34 }).success,
    ).toBe(false)
  })

  it('rechaza confidence fuera de rango', () => {
    expect(
      ReceiptResultSchema.safeParse({ ...valid, confidence: 1.01 }).success,
    ).toBe(false)
  })

  it('rechaza una fecha de calendario inválida', () => {
    expect(
      ReceiptResultSchema.safeParse({ ...valid, date: '2026-02-30' }).success,
    ).toBe(false)
  })

  it('rechaza moneda fuera del formato ISO de tres mayúsculas', () => {
    expect(
      ReceiptResultSchema.safeParse({ ...valid, currency: 'mxn' }).success,
    ).toBe(false)
  })

  it('produce invalid_ocr_response sin exponer el payload inválido', () => {
    expect(() =>
      parseReceiptRecognitionResult({ total: 'secret' }),
    ).toThrowError(
      expect.objectContaining<Partial<InvalidOCRResponseError>>({
        code: 'invalid_ocr_response',
      }),
    )
  })

  it('acepta límites y todos los campos nullable del contrato OCR', () => {
    expect(
      ReceiptResultSchema.parse({
        merchant: null,
        date: null,
        total: 0,
        currency: null,
        confidence: 0,
        rawText: null,
      }),
    ).toEqual({
      merchant: null,
      date: null,
      total: 0,
      currency: null,
      confidence: 0,
      rawText: null,
    })
    expect(
      ReceiptResultSchema.parse({ ...valid, confidence: 1 }),
    ).toMatchObject({ confidence: 1 })
  })

  it.each([
    ['timestamp en fecha', { date: '2026-08-02T00:00:00.000Z' }],
    ['total negativo', { total: -1 }],
    ['total NaN', { total: Number.NaN }],
    ['total infinito', { total: Number.POSITIVE_INFINITY }],
    ['moneda minúscula', { currency: 'mxn' }],
    ['moneda corta', { currency: 'MX' }],
    ['moneda larga', { currency: 'MXNN' }],
    ['confianza negativa', { confidence: -0.01 }],
    ['confianza mayor a uno', { confidence: 1.01 }],
    [
      'comercio demasiado largo',
      { merchant: 'm'.repeat(MAX_RECEIPT_MERCHANT_LENGTH + 1) },
    ],
    [
      'texto crudo demasiado largo',
      { rawText: 'r'.repeat(MAX_RECEIPT_RAW_TEXT_LENGTH + 1) },
    ],
    ['tipo incorrecto', { merchant: 42 }],
    ['campo inesperado', { secret: 'never' }],
  ] as const)('rechaza %s', (_label, override) => {
    expect(
      ReceiptResultSchema.safeParse({ ...valid, ...override }).success,
    ).toBe(false)
  })

  it.each([{}, null, undefined, []])(
    'rechaza una respuesta vacía o incompatible: %j',
    (value) => {
      expect(ReceiptResultSchema.safeParse(value).success).toBe(false)
    },
  )
})
