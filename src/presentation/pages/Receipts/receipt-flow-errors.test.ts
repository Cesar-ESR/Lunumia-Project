import { describe, expect, it } from 'vitest'
import { InvalidOCRResponseError } from '@application/contracts'
import {
  ReceiptRecognitionError,
  type ReceiptRecognitionErrorKind,
} from '@infrastructure/ocr'
import {
  NativePlatformError,
  ReceiptImageError,
} from '@infrastructure/platform'
import { toReceiptFlowFailure } from './receipt-flow-errors'

describe('receipt flow error privacy and retry policy', () => {
  it.each([
    ['unauthenticated', false],
    ['invalid_image', false],
    ['payload_too_large', false],
    ['provider_timeout', true],
    ['provider_unavailable', true],
    ['rate_limited', true],
    ['invalid_provider_response', false],
    ['network_error', true],
    ['unknown', true],
  ] as const)(
    'mapea %s a mensaje sanitizado y retry=%s',
    (kind, canRetryRecognition) => {
      const technical = new Error(
        'JWT private-provider https://internal.example table.receipts base64',
      )
      const failure = toReceiptFlowFailure(
        new ReceiptRecognitionError(kind as ReceiptRecognitionErrorKind, {
          cause: technical,
        }),
      )
      expect(failure).toMatchObject({ kind, canRetryRecognition })
      expect(failure.message).not.toMatch(
        /JWT|private-provider|internal\.example|table\.receipts|base64/i,
      )
    },
  )

  it('normaliza invalid_ocr_response como invalid_provider_response', () => {
    expect(toReceiptFlowFailure(new InvalidOCRResponseError())).toMatchObject({
      kind: 'invalid_provider_response',
      canRetryRecognition: false,
    })
  })

  it.each([
    ['unsupported_type', 'Selecciona una imagen JPEG o PNG.'],
    ['file_too_large', 'La imagen debe pesar menos de 10 MB.'],
    ['empty_file', 'La imagen seleccionada está vacía.'],
    ['read_failed', 'No se pudo leer la imagen. Intenta con otro archivo.'],
    ['decode_failed', 'No se pudo abrir la imagen. Intenta con otro archivo.'],
    [
      'compression_failed',
      'No se pudo comprimir la imagen. Intenta nuevamente.',
    ],
  ] as const)('conserva el error de imagen tipado %s', (code, message) => {
    expect(toReceiptFlowFailure(new ReceiptImageError(code))).toEqual({
      kind: 'image',
      message,
      canRetryRecognition: false,
    })
  })

  it('muestra alternativas seguras cuando Android deniega la cámara', () => {
    expect(
      toReceiptFlowFailure(new NativePlatformError('permission_denied')),
    ).toEqual({
      kind: 'image',
      message:
        'No tenemos permiso para usar la cámara. Puedes elegir una imagen de tu galería o registrar el gasto manualmente.',
      canRetryRecognition: false,
    })
  })
})
