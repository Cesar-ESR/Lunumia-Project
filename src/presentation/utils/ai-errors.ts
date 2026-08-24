export type AIErrorPresentation = {
  kind: 'rate_limited' | 'error'
  message: string
  retryAfterSeconds: number | null
}

const messages: Record<string, string> = {
  unauthenticated: 'Necesitas iniciar sesión para utilizar esta función.',
  invalid_request: 'No pudimos preparar los datos para esta función.',
  insufficient_planning_context:
    'La proyección todavía no tiene todos los datos necesarios para explicarse.',
  description_too_long: 'La descripción es demasiado larga para esta función.',
  too_many_categories: 'Hay demasiadas categorías para procesar.',
  rate_limited: 'Alcanzaste temporalmente el límite de funciones inteligentes.',
  rate_limit_unavailable:
    'El control de solicitudes no está disponible en este momento.',
  provider_timeout: 'La respuesta tardó demasiado. Intenta nuevamente.',
  provider_unavailable:
    'Las funciones inteligentes no están disponibles en este momento.',
  invalid_provider_response: 'No pudimos interpretar la respuesta.',
  invalid_ai_response: 'No pudimos interpretar la respuesta.',
  network_error:
    'No se pudo contactar con el servicio. Tus datos locales siguen disponibles.',
  unknown: 'No se pudo completar la función inteligente.',
}

export function presentAIError(reason: unknown): AIErrorPresentation {
  const code = readString(reason, 'code') ?? 'unknown'
  const retryAfter = readNumber(reason, 'retryAfterSeconds')
  return {
    kind: code === 'rate_limited' ? 'rate_limited' : 'error',
    message: messages[code] ?? messages.unknown ?? 'No fue posible continuar.',
    retryAfterSeconds: retryAfter,
  }
}

function readString(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : null
}

function readNumber(value: unknown, key: string): number | null {
  return isRecord(value) && typeof value[key] === 'number' ? value[key] : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
