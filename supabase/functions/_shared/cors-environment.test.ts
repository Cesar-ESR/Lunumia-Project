import { describe, expect, it } from 'vitest'
import { readConfiguredAllowedOrigins } from './cors-environment'

describe('contrato de orígenes Edge', () => {
  it('acepta los tres orígenes de transición mediante ALLOWED_ORIGINS', () => {
    const origins = readConfiguredAllowedOrigins(
      'https://lunumia.com, https://www.lunumia.com, https://app.lunumia.com',
      undefined,
    )

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://lunumia.com',
        'https://www.lunumia.com',
        'https://app.lunumia.com',
      ]),
    )
  })

  it('usa ALLOWED_ORIGIN sólo como fallback legacy', () => {
    expect(
      readConfiguredAllowedOrigins(undefined, 'https://lunumia.com'),
    ).toContain('https://lunumia.com')
    expect(
      readConfiguredAllowedOrigins(
        'https://www.lunumia.com',
        'https://legacy.example',
      ),
    ).not.toContain('https://legacy.example')
  })

  it('sin configuración conserva únicamente defaults locales seguros', () => {
    const origins = readConfiguredAllowedOrigins(undefined, undefined)
    expect(origins).toEqual([
      'https://localhost',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ])
    expect(origins).not.toContain('*')
    expect(origins).not.toContain('https://evil.example')
  })

  it('rechaza wildcard incluso si fue configurado explícitamente', () => {
    expect(readConfiguredAllowedOrigins('*', undefined)).not.toContain('*')
  })
})
