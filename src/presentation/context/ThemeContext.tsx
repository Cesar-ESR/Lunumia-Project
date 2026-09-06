import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ThemePreference } from '@domain/entities'
import {
  applyTheme,
  readStoredThemePreference,
  readSystemPrefersDark,
  resolveEffectiveTheme,
  storeThemePreference,
  SYSTEM_THEME_QUERY,
  type EffectiveTheme,
} from '../theme/theme'

interface ThemeContextValue {
  preference: ThemePreference
  effectiveTheme: EffectiveTheme
  setPreference(preference: ThemePreference): void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredThemePreference(),
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    readSystemPrefersDark(),
  )
  const effectiveTheme: EffectiveTheme = resolveEffectiveTheme(
    preference,
    systemPrefersDark,
  )

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    const currentSystemPreference = readSystemPrefersDark()
    storeThemePreference(nextPreference)
    setSystemPrefersDark(currentSystemPreference)
    setPreferenceState(nextPreference)
    applyTheme(nextPreference, currentSystemPreference)
  }, [])

  useLayoutEffect(() => {
    applyTheme(preference, systemPrefersDark)
  }, [preference, systemPrefersDark])

  useEffect(() => {
    if (preference !== 'system' || !globalThis.matchMedia) return
    const mediaQuery = globalThis.matchMedia(SYSTEM_THEME_QUERY)
    const updateEffectiveTheme = () => setSystemPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateEffectiveTheme)
    return () => mediaQuery.removeEventListener('change', updateEffectiveTheme)
  }, [preference])

  const value = useMemo(
    () => ({ preference, effectiveTheme, setPreference }),
    [effectiveTheme, preference, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider.')
  return context
}
