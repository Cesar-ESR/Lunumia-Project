import { describe, expect, it } from 'vitest'
import { getAuthRedirectUrl } from './AuthRedirectUrl'

describe('getAuthRedirectUrl', () => {
  it('conserva las rutas web actuales', () => {
    expect(getAuthRedirectUrl('/verify-email', false, 'https://app.test')).toBe(
      'https://app.test/verify-email',
    )
    expect(
      getAuthRedirectUrl('/reset-password', false, 'https://app.test'),
    ).toBe('https://app.test/reset-password')
  })

  it('usa el callback nativo único en Android', () => {
    expect(
      getAuthRedirectUrl('/reset-password', true, 'https://app.test'),
    ).toBe('com.gastoclaro.app://auth/callback')
  })
})
