import { describe, expect, it } from 'vitest'
import {
  APP_ENTRY_ROUTES,
  APP_ORIGIN,
  MARKETING_ORIGIN,
  PWA_SCOPE,
  PWA_START_URL,
  TRANSITIONAL_APP_ORIGINS,
  WWW_MARKETING_ORIGIN,
} from './web-origins'

describe('contrato de orígenes web de Lunumia', () => {
  it('separa marketing, WWW y la aplicación Web/PWA canónica', () => {
    expect(MARKETING_ORIGIN).toBe('https://lunumia.com')
    expect(WWW_MARKETING_ORIGIN).toBe('https://www.lunumia.com')
    expect(APP_ORIGIN).toBe('https://app.lunumia.com')
    expect(TRANSITIONAL_APP_ORIGINS).toEqual([
      MARKETING_ORIGIN,
      WWW_MARKETING_ORIGIN,
      APP_ORIGIN,
    ])
  })

  it('mantiene start_url, scope y rutas de entrada relativos al mismo origen', () => {
    expect(PWA_START_URL).toBe('/')
    expect(PWA_SCOPE).toBe('/')
    expect(Object.values(APP_ENTRY_ROUTES)).toEqual(
      expect.arrayContaining(['/', '/login', '/register']),
    )
    for (const value of [
      PWA_START_URL,
      PWA_SCOPE,
      ...Object.values(APP_ENTRY_ROUTES),
    ]) {
      expect(value).toMatch(/^\//)
      expect(value).not.toMatch(/^https?:\/\//)
    }
  })
})
