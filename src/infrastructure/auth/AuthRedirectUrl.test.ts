import { describe, expect, it } from 'vitest'
import { APP_ORIGIN, MARKETING_ORIGIN } from '@shared/constants/web-origins'
import { getAuthRedirectUrl } from './AuthRedirectUrl'

describe('getAuthRedirectUrl', () => {
  it('usa el origen canónico de la app y conserva los callbacks web actuales', () => {
    expect(getAuthRedirectUrl('/verify-email', false, APP_ORIGIN)).toBe(
      'https://app.lunumia.com/verify-email',
    )
    const recovery = getAuthRedirectUrl('/reset-password', false, APP_ORIGIN)
    expect(recovery).toBe('https://app.lunumia.com/reset-password')
    expect(recovery).not.toBe(`${MARKETING_ORIGIN}/`)
  })

  it('usa el callback nativo único en Android', () => {
    expect(getAuthRedirectUrl('/reset-password', true, APP_ORIGIN)).toBe(
      'com.gastoclaro.app://auth/callback',
    )
  })
})
