export function readBearerToken(value: string | null): string | null {
  if (!value?.startsWith('Bearer ')) return null
  const token = value.slice(7).trim()
  return token || null
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function jsonResponse(
  status: number,
  body: unknown,
  origin: string | null,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders)
  if (origin)
    new Headers(corsHeaders(origin)).forEach((value, key) =>
      headers.set(key, value),
    )
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}
