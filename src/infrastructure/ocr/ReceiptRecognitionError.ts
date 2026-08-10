export type ReceiptRecognitionErrorKind =
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

const messages: Record<ReceiptRecognitionErrorKind, string> = {
  unauthenticated: 'Inicia sesión para reconocer un recibo.',
  invalid_image: 'La imagen del recibo no es válida.',
  payload_too_large: 'La imagen comprimida todavía es demasiado grande.',
  provider_timeout: 'El reconocimiento tardó demasiado. Intenta nuevamente.',
  provider_unavailable: 'El reconocimiento no está disponible temporalmente.',
  rate_limited: 'Se alcanzó el límite de reconocimientos. Intenta más tarde.',
  rate_limit_unavailable:
    'El control de reconocimientos no está disponible temporalmente.',
  invalid_provider_response: 'El proveedor devolvió una respuesta inválida.',
  network_error: 'No se pudo conectar con el servicio de reconocimiento.',
  unknown: 'No fue posible reconocer el recibo.',
}

export class ReceiptRecognitionError extends Error {
  constructor(
    public readonly kind: ReceiptRecognitionErrorKind,
    options?: ErrorOptions,
  ) {
    super(messages[kind], options)
    this.name = 'ReceiptRecognitionError'
  }
}
