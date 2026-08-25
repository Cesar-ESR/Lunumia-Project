import { describe, expect, it } from 'vitest'
import {
  formatRecognitionResponse,
  parseRecognitionRequest,
  ReceiptRecognitionResponseSchema,
} from './contracts'
import {
  ProductionV1ReceiptRequestSchema,
  ProductionV1ReceiptResponseSchema,
} from '../../compatibility/production-v1-contracts'

const imageBase64 = '/9j/2Q=='
const legacyRequest = { imageBase64, mimeType: 'image/jpeg' as const }
const v2Request = { ...legacyRequest, responseVersion: 2 as const }
const canonicalResult = ReceiptRecognitionResponseSchema.parse({
  merchant: 'Comercio',
  date: '2026-08-24',
  subtotal: 10_000,
  tax: 1_600,
  tip: null,
  discount: null,
  otherFees: null,
  total: 11_600,
  amountPaid: 11_600,
  amountEvidence: 'TOTAL 116.00',
  amountAmbiguous: false,
  currency: 'MXN',
  confidence: 0.9,
  rawText: null,
})

describe('contratos OCR legacy y V2', () => {
  it('reconoce el request exacto de producción como legacy por defecto', () => {
    expect(ProductionV1ReceiptRequestSchema.parse(legacyRequest)).toEqual(
      legacyRequest,
    )
    expect(parseRecognitionRequest(legacyRequest)).toEqual({
      ...legacyRequest,
      responseVersion: 'legacy',
    })
  })

  it('requiere responseVersion 2 para seleccionar la respuesta V2', () => {
    expect(parseRecognitionRequest(v2Request)).toEqual(v2Request)
  })

  it('mapea una sola salida canónica a la respuesta legacy exacta', () => {
    const legacy = formatRecognitionResponse(canonicalResult, 'legacy')
    expect(ProductionV1ReceiptResponseSchema.parse(legacy)).toEqual({
      merchant: 'Comercio',
      date: '2026-08-24',
      total: 11_600,
      currency: 'MXN',
      confidence: 0.9,
      rawText: null,
    })
  })

  it('conserva todos los campos de evidencia en V2', () => {
    expect(formatRecognitionResponse(canonicalResult, 2)).toEqual(
      canonicalResult,
    )
  })

  it.each([
    { ...legacyRequest, responseVersion: 1 },
    { ...legacyRequest, responseVersion: 3 },
    { ...legacyRequest, responseVersion: '2' },
  ])('rechaza una versión explícita desconocida', (value) => {
    expect(() => parseRecognitionRequest(value)).toThrowError(
      expect.objectContaining({ code: 'unsupported_response_version' }),
    )
  })

  it('no acepta campos V2 sin el discriminador', () => {
    expect(() =>
      parseRecognitionRequest({ ...legacyRequest, amountEvidence: 'TOTAL' }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_image' }))
  })
})
