export type AIInsightsFunctionErrorCode =
  | 'forbidden_origin'
  | 'not_found'
  | 'method_not_allowed'
  | 'unauthenticated'
  | 'invalid_request'
  | 'insufficient_planning_context'
  | 'description_too_long'
  | 'too_many_categories'
  | 'rate_limited'
  | 'rate_limit_unavailable'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'invalid_provider_response'
  | 'unknown'

const details: Record<
  AIInsightsFunctionErrorCode,
  { status: number; message: string }
> = {
  forbidden_origin: { status: 403, message: 'Origen no permitido.' },
  not_found: { status: 404, message: 'Endpoint no encontrado.' },
  method_not_allowed: { status: 405, message: 'Método no permitido.' },
  unauthenticated: { status: 401, message: 'No autorizado.' },
  invalid_request: { status: 400, message: 'La solicitud no es válida.' },
  insufficient_planning_context: {
    status: 422,
    message: 'La proyección no tiene suficientes datos para explicarse.',
  },
  description_too_long: {
    status: 400,
    message: 'La descripción excede el límite permitido.',
  },
  too_many_categories: {
    status: 400,
    message: 'La solicitud contiene demasiadas categorías.',
  },
  rate_limited: { status: 429, message: 'Demasiadas solicitudes.' },
  rate_limit_unavailable: {
    status: 503,
    message: 'El control de solicitudes no está disponible.',
  },
  provider_timeout: {
    status: 504,
    message: 'El proveedor excedió el tiempo límite.',
  },
  provider_unavailable: {
    status: 503,
    message: 'El proveedor no está disponible.',
  },
  invalid_provider_response: {
    status: 502,
    message: 'El proveedor devolvió una respuesta inválida.',
  },
  unknown: { status: 500, message: 'No fue posible generar el contenido.' },
}

export class AIInsightsFunctionError extends Error {
  readonly status: number

  constructor(public readonly code: AIInsightsFunctionErrorCode) {
    const detail = details[code]
    super(detail.message)
    this.name = 'AIInsightsFunctionError'
    this.status = detail.status
  }
}
