import type { ThemePreference } from '@domain/entities'

export type EffectiveTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'lunumia.theme-preference'
export const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

const THEME_COLOR: Record<EffectiveTheme, string> = {
  light: '#1267d6',
  dark: '#111c2b',
}

interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readStoredThemePreference(
  storage?: ThemeStorage,
): ThemePreference {
  try {
    const stored = (storage ?? globalThis.localStorage).getItem(
      THEME_STORAGE_KEY,
    )
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function storeThemePreference(
  preference: ThemePreference,
  storage?: ThemeStorage,
): void {
  try {
    const target = storage ?? globalThis.localStorage
    target.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // user_settings remains authoritative when browser storage is unavailable.
  }
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): EffectiveTheme {
  return preference === 'system'
    ? systemPrefersDark
      ? 'dark'
      : 'light'
    : preference
}

export function readSystemPrefersDark(): boolean {
  return globalThis.matchMedia?.(SYSTEM_THEME_QUERY).matches ?? false
}

export function applyTheme(
  preference: ThemePreference,
  systemPrefersDark = readSystemPrefersDark(),
  root = document.documentElement,
): EffectiveTheme {
  const effectiveTheme = resolveEffectiveTheme(preference, systemPrefersDark)
  root.dataset.themePreference = preference
  root.dataset.theme = effectiveTheme
  root.style.colorScheme = effectiveTheme
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[effectiveTheme])
  return effectiveTheme
}
