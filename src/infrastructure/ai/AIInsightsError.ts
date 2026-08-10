export type AIErrorCode =
  | 'unauthenticated'
  | 'invalid_request'
  | 'description_too_long'
  | 'too_many_categories'
  | 'rate_limited'
  | 'rate_limit_unavailable'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'invalid_provider_response'
  | 'invalid_ai_response'
  | 'network_error'
  | 'unknown'

const messages: Record<AIErrorCode, string> = {
  unauthenticated:
    'Inicia sesión para usar las funciones de inteligencia artificial.',
  invalid_request: 'Los datos para generar el contenido no son válidos.',
  description_too_long: 'La descripción es demasiado larga.',
  too_many_categories: 'Hay demasiadas categorías para procesar.',
  rate_limited: 'Se alcanzó el límite de solicitudes. Intenta más tarde.',
  rate_limit_unavailable:
    'El control de solicitudes no está disponible temporalmente.',
  provider_timeout: 'La generación tardó demasiado. Intenta nuevamente.',
  provider_unavailable:
    'La función de inteligencia artificial no está disponible.',
  invalid_provider_response: 'El proveedor devolvió una respuesta inválida.',
  invalid_ai_response: 'La respuesta recibida no es válida.',
  network_error: 'No se pudo conectar con el servicio.',
  unknown: 'No fue posible generar el contenido.',
}

export class AIInsightsError extends Error {
  readonly retryAfterSeconds: number | null

  constructor(
    public readonly code: AIErrorCode,
    options?: ErrorOptions & { retryAfterSeconds?: number | null },
  ) {
    super(messages[code], options)
    this.name = 'AIInsightsError'
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null
  }
}
