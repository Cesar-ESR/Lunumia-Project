export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'
export const THEME_KEY = 'lunumia.landing.theme'
export const SYSTEM_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return isPreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function initializeTheme() {
  let preference = readPreference()
  const media = window.matchMedia?.(SYSTEM_QUERY)
  const root = document.documentElement
  const menu = document.querySelector<HTMLDetailsElement>('.appearance-menu')
  const radios = [
    ...document.querySelectorAll<HTMLInputElement>(
      'input[name="landing-theme"]',
    ),
  ]
  const apply = () => {
    const effective: EffectiveTheme =
      preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference
    root.dataset.themePreference = preference
    root.dataset.theme = effective
    root.style.colorScheme = effective
    root.style.backgroundColor = effective === 'dark' ? '#0c111b' : '#f6f8fc'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', effective === 'dark' ? '#111c2b' : '#1267d6')
    radios.forEach((radio) => {
      radio.checked = radio.value === preference
    })
  }
  const onSystemChange = () => {
    if (preference === 'system') apply()
  }
  const onChange = (event: Event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !isPreference(input.value))
      return
    preference = input.value
    apply()
    try {
      localStorage.setItem(THEME_KEY, preference)
    } catch {
      /* Keep working in memory. */
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu?.open) {
      menu.open = false
      menu.querySelector('summary')?.focus()
    }
  }
  const onPointerDown = (event: PointerEvent) => {
    if (
      menu?.open &&
      event.target instanceof Node &&
      !menu.contains(event.target)
    )
      menu.open = false
  }
  apply()
  media?.addEventListener('change', onSystemChange)
  radios.forEach((radio) => radio.addEventListener('change', onChange))
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('pointerdown', onPointerDown)
  return () => {
    media?.removeEventListener('change', onSystemChange)
    radios.forEach((radio) => radio.removeEventListener('change', onChange))
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('pointerdown', onPointerDown)
  }
}
