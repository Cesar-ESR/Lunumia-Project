export interface DeleteAccountDependencies {
  allowedOrigins: readonly string[]
  verifyToken(token: string): Promise<{ userId: string } | null>
  deleteUserData(userId: string): Promise<void>
  deleteAuthUser(userId: string): Promise<void>
}

function json(
  status: number,
  body: { message: string },
  origin?: string,
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(body), { status, headers })
}

async function hasArbitraryUserId(request: Request): Promise<boolean> {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null && 'userId' in body
  } catch {
    return false
  }
}

export function createDeleteAccountHandler(
  dependencies: DeleteAccountDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const requestOrigin = request.headers.get('Origin')
    const permittedOrigin =
      requestOrigin === null ||
      dependencies.allowedOrigins.includes(requestOrigin)
    if (!permittedOrigin) return json(403, { message: 'Origen no permitido.' })

    if (request.method === 'OPTIONS') {
      if (!requestOrigin) return json(400, { message: 'Origen requerido.' })
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': requestOrigin,
          'Access-Control-Allow-Headers':
            'authorization, content-type, x-client-info, apikey',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      })
    }
    if (request.method !== 'POST')
      return json(
        405,
        { message: 'Método no permitido.' },
        requestOrigin ?? undefined,
      )

    const authorization = request.headers.get('Authorization')
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : ''
    if (!token)
      return json(
        401,
        { message: 'No autorizado.' },
        requestOrigin ?? undefined,
      )
    if (await hasArbitraryUserId(request))
      return json(
        400,
        { message: 'La identidad se obtiene de la sesión.' },
        requestOrigin ?? undefined,
      )

    try {
      const identity = await dependencies.verifyToken(token)
      if (!identity)
        return json(
          401,
          { message: 'No autorizado.' },
          requestOrigin ?? undefined,
        )
      await dependencies.deleteUserData(identity.userId)
      await dependencies.deleteAuthUser(identity.userId)
      return json(
        200,
        { message: 'Cuenta eliminada.' },
        requestOrigin ?? undefined,
      )
    } catch {
      return json(
        500,
        { message: 'No fue posible eliminar la cuenta.' },
        requestOrigin ?? undefined,
      )
    }
  }
}
