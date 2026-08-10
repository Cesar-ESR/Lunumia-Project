export const ANDROID_AUTH_CALLBACK_URL =
  'com.gastoclaro.app://auth/callback' as const

export interface ParsedAuthCodeCallback {
  kind: 'code'
  code: string
  flowId: string | null
}

export interface ParsedAuthErrorCallback {
  kind: 'error'
}

export type ParsedAuthCallback =
  ParsedAuthCodeCallback | ParsedAuthErrorCallback

const allowedParameters = new Set([
  'code',
  'sb_flow_id',
  'error',
  'error_code',
  'error_description',
])
const flowIdPattern = /^[a-zA-Z0-9_-]{8,64}$/

export function parseAuthCallbackUrl(
  urlValue: string,
): ParsedAuthCallback | null {
  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    return null
  }
  if (
    url.protocol !== 'com.gastoclaro.app:' ||
    url.hostname !== 'auth' ||
    url.port !== '' ||
    url.pathname !== '/callback' ||
    url.hash !== ''
  )
    return null

  for (const parameter of url.searchParams.keys())
    if (!allowedParameters.has(parameter)) return null

  if (
    url.searchParams.has('error') ||
    url.searchParams.has('error_code') ||
    url.searchParams.has('error_description')
  )
    return { kind: 'error' }

  const codes = url.searchParams.getAll('code')
  const code = codes[0]
  if (codes.length !== 1 || !code || code.length > 4_096)
    return { kind: 'error' }

  const flowIds = url.searchParams.getAll('sb_flow_id')
  if (flowIds.length > 1) return { kind: 'error' }
  const flowId = flowIds[0] ?? null
  if (flowId !== null && !flowIdPattern.test(flowId)) return { kind: 'error' }

  return { kind: 'code', code, flowId }
}
