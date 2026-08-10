import { InvalidOCRResponseError } from '@application/contracts'
import { ReceiptRecognitionError } from '@infrastructure/ocr'
import {
  NativePlatformError,
  ReceiptImageError,
} from '@infrastructure/platform'

export type ReceiptFlowErrorKind =
  | 'image'
  | 'unauthenticated'
  | 'invalid_image'
  | 'payload_too_large'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'rate_limit_unavailable'
  | 'invalid_provider_response'
  | 'network_error'
  | 'unknown'

export interface ReceiptFlowFailure {
  kind: ReceiptFlowErrorKind
  message: string
  canRetryRecognition: boolean
}

const messages: Record<Exclude<ReceiptFlowErrorKind, 'image'>, string> = {
  unauthenticated: 'Necesitas iniciar sesión para analizar recibos.',
  invalid_image: 'No se pudo procesar esta imagen. Prueba con otra fotografía.',
  payload_too_large:
    'La imagen sigue siendo demasiado grande. Prueba con otra fotografía.',
  provider_timeout:
    'El análisis tardó demasiado. Puedes intentarlo de nuevo o registrar el gasto manualmente.',
  provider_unavailable: 'El reconocimiento no está disponible en este momento.',
  rate_limited:
    'Se alcanzó temporalmente el límite de análisis. Intenta más tarde.',
  rate_limit_unavailable:
    'El control de solicitudes no está disponible. Intenta más tarde.',
  invalid_provider_response:
    'No pudimos interpretar el recibo. Revisa los datos manualmente.',
  network_error:
    'Sin conexión. Puedes registrar el gasto manualmente y sincronizarlo después.',
  unknown: 'No se pudo analizar el recibo.',
}

export function toReceiptFlowFailure(reason: unknown): ReceiptFlowFailure {
  if (reason instanceof NativePlatformError)
    return {
      kind: 'image',
      message: reason.message,
      canRetryRecognition: false,
    }
  if (reason instanceof ReceiptImageError)
    return {
      kind: 'image',
      message: reason.message,
      canRetryRecognition: false,
    }
  if (reason instanceof InvalidOCRResponseError)
    return {
      kind: 'invalid_provider_response',
      message: messages.invalid_provider_response,
      canRetryRecognition: false,
    }
  if (reason instanceof ReceiptRecognitionError)
    return {
      kind: reason.kind,
      message: messages[reason.kind],
      canRetryRecognition: [
        'provider_timeout',
        'provider_unavailable',
        'rate_limited',
        'rate_limit_unavailable',
        'network_error',
        'unknown',
      ].includes(reason.kind),
    }
  return {
    kind: 'unknown',
    message: messages.unknown,
    canRetryRecognition: true,
  }
}
