import { describe, expect, it } from 'vitest'
import { parseAuthCallbackUrl } from './AuthCallbackUrl'

describe('parseAuthCallbackUrl', () => {
  it('acepta exclusivamente el callback Android esperado', () => {
    expect(
      parseAuthCallbackUrl(
        'com.gastoclaro.app://auth/callback?code=abc123&sb_flow_id=12345678',
      ),
    ).toEqual({ kind: 'code', code: 'abc123', flowId: '12345678' })
  })

  it.each([
    'com.gastoclaro.app://evil/callback?code=x',
    'com.gastoclaro.app://auth/other?code=x',
    'https://auth/callback?code=x',
    'javascript:alert(1)',
    'data:text/plain,test',
    'com.gastoclaro.app://auth/callback#access_token=secret',
    'com.gastoclaro.app://auth/callback?code=x&unexpected=true',
  ])('rechaza una URL ajena o parámetros inseguros: %s', (url) => {
    expect(parseAuthCallbackUrl(url)).toBeNull()
  })

  it('normaliza errores remotos sin extraer ni devolver su detalle', () => {
    expect(
      parseAuthCallbackUrl(
        'com.gastoclaro.app://auth/callback?error=access_denied&error_description=secret',
      ),
    ).toEqual({ kind: 'error' })
  })

  it('trata un callback propio sin código como error seguro', () => {
    expect(parseAuthCallbackUrl('com.gastoclaro.app://auth/callback')).toEqual({
      kind: 'error',
    })
  })
})
