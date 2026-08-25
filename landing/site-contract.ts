export const LANDING_ORIGIN = 'https://lunumia.com' as const
export const WWW_MARKETING_ORIGIN = 'https://www.lunumia.com' as const
export const APP_ORIGIN = 'https://app.lunumia.com' as const

export const APP_DESTINATIONS = {
  open: `${APP_ORIGIN}/`,
  login: `${APP_ORIGIN}/login`,
  register: `${APP_ORIGIN}/register`,
} as const

const replacements = {
  '{{LANDING_ORIGIN}}': `${LANDING_ORIGIN}/`,
  '{{APP_OPEN_URL}}': APP_DESTINATIONS.open,
  '{{APP_LOGIN_URL}}': APP_DESTINATIONS.login,
  '{{APP_REGISTER_URL}}': APP_DESTINATIONS.register,
} as const

export function renderLandingHtml(source: string): string {
  const rendered = Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    source,
  )
  if (/{{[A-Z_]+}}/.test(rendered))
    throw new Error('Landing HTML contains an unresolved contract token.')
  return rendered
}
