export type OCRFunctionErrorCode =
  | 'unauthenticated'
  | 'invalid_image'
  | 'payload_too_large'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'rate_limit_unavailable'
  | 'invalid_provider_response'
  | 'unknown'

const errorDetails: Record<
  OCRFunctionErrorCode,
  { status: number; message: string }
> = {
  unauthenticated: { status: 401, message: 'No autorizado.' },
  invalid_image: { status: 400, message: 'La imagen no es válida.' },
  payload_too_large: { status: 413, message: 'La imagen es demasiado grande.' },
  provider_timeout: {
    status: 504,
    message: 'El proveedor excedió el tiempo límite.',
  },
  provider_unavailable: {
    status: 503,
    message: 'El proveedor no está disponible.',
  },
  rate_limited: { status: 429, message: 'Demasiadas solicitudes.' },
  rate_limit_unavailable: {
    status: 503,
    message: 'El control de solicitudes no está disponible.',
  },
  invalid_provider_response: {
    status: 502,
    message: 'El proveedor devolvió una respuesta inválida.',
  },
  unknown: { status: 500, message: 'No fue posible reconocer el recibo.' },
}

export class OCRFunctionError extends Error {
  readonly status: number

  constructor(public readonly code: OCRFunctionErrorCode) {
    const details = errorDetails[code]
    super(details.message)
    this.name = 'OCRFunctionError'
    this.status = details.status
  }
}
