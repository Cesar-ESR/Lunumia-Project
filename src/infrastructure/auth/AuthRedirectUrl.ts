import { ANDROID_AUTH_CALLBACK_URL } from './AuthCallbackUrl'

export function getAuthRedirectUrl(
  webPath: '/verify-email' | '/reset-password',
  native: boolean,
  webOrigin: string,
): string {
  return native
    ? ANDROID_AUTH_CALLBACK_URL
    : new URL(webPath, webOrigin).toString()
}
