export const MARKETING_ORIGIN = 'https://lunumia.com' as const
export const WWW_MARKETING_ORIGIN = 'https://www.lunumia.com' as const
export const APP_ORIGIN = 'https://app.lunumia.com' as const

export const TRANSITIONAL_APP_ORIGINS = [
  MARKETING_ORIGIN,
  WWW_MARKETING_ORIGIN,
  APP_ORIGIN,
] as const

// Root is the safe entry point: React Router resolves it to /inicio while
// preserving the existing auth and first-time setup decisions.
export const PWA_START_URL = '/' as const
export const PWA_SCOPE = '/' as const

export const APP_ENTRY_ROUTES = {
  open: '/',
  login: '/login',
  signup: '/register',
  verifyEmail: '/verify-email',
  resetPassword: '/reset-password',
} as const
