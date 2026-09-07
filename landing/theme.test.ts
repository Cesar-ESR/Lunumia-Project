import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import source from './index.html?raw'
import { initializeTheme, readPreference, THEME_KEY } from './theme'

let dispose: (() => void) | undefined
let dark = false
const listeners = new Set<() => void>()
const media = {
  get matches() {
    return dark
  },
  addEventListener: vi.fn((_event: string, listener: () => void) =>
    listeners.add(listener),
  ),
  removeEventListener: vi.fn((_event: string, listener: () => void) =>
    listeners.delete(listener),
  ),
}
const select = (value: string) => {
  const radio = document.querySelector<HTMLInputElement>(
    `input[value="${value}"]`,
  )!
  radio.checked = true
  radio.dispatchEvent(new Event('change'))
}
const osChange = (value: boolean) => {
  dark = value
  listeners.forEach((listener) => listener())
}
beforeEach(() => {
  localStorage.clear()
  dark = false
  listeners.clear()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.themePreference
})

describe('landing theme', () => {
  it.each([
    ['system', 'Sistema'],
    ['light', 'Claro'],
    ['dark', 'Oscuro'],
  ])(
    'restores and immediately updates the icon preference and accessible name: %s',
    (preference, label) => {
      dark = true
      localStorage.setItem(THEME_KEY, preference)
      dispose = initializeTheme()
      const summary = document.querySelector('.appearance-menu summary')!
      const assertPreference = () => {
        expect(document.documentElement.dataset.themePreference).toBe(
          preference,
        )
        expect(summary.getAttribute('aria-label')).toBe(`Apariencia: ${label}`)
        expect(summary.querySelector('span')?.textContent).toBe('Apariencia')
        expect(
          summary.querySelector(`[data-preference-icon="${preference}"]`),
        ).not.toBeNull()
      }
      assertPreference()
      select(preference === 'light' ? 'dark' : 'light')
      select(preference)
      assertPreference()
      osChange(false)
      osChange(true)
      assertPreference()
      if (preference === 'system')
        expect(document.documentElement.dataset.theme).toBe('dark')
    },
  )

  it.each([false, true])(
    'defaults to system and resolves OS dark=%s',
    (osDark) => {
      dark = osDark
      dispose = initializeTheme()
      expect(readPreference()).toBe('system')
      expect(document.documentElement.dataset.themePreference).toBe('system')
      expect(document.documentElement.dataset.theme).toBe(
        osDark ? 'dark' : 'light',
      )
      expect(
        document.querySelector<HTMLInputElement>('input[value="system"]')
          ?.checked,
      ).toBe(true)
    },
  )
  it.each(['light', 'dark'])(
    'restores explicit %s and ignores OS changes',
    (preference) => {
      localStorage.setItem(THEME_KEY, preference)
      dispose = initializeTheme()
      osChange(true)
      osChange(false)
      expect(document.documentElement.dataset.theme).toBe(preference)
      expect(
        document.querySelector<HTMLInputElement>(`input[value="${preference}"]`)
          ?.checked,
      ).toBe(true)
    },
  )
  it('follows live OS changes only in system mode', () => {
    dispose = initializeTheme()
    osChange(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    osChange(false)
    expect(document.documentElement.dataset.theme).toBe('light')
  })
  it('applies, persists, and restores choices immediately including browser color scheme', () => {
    dispose = initializeTheme()
    const lightColor = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute('content')
    select('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).not.toBe(lightColor)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    dispose()
    dispose = initializeTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
    select('system')
    expect(localStorage.getItem(THEME_KEY)).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
  it('ignores invalid stored preferences', () => {
    localStorage.setItem(THEME_KEY, 'invalid')
    expect(readPreference()).toBe('system')
  })
  it('survives unavailable storage for both reading and writing', () => {
    vi.stubGlobal('localStorage', undefined)
    dark = true
    expect(() => {
      dispose = initializeTheme()
    }).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(() => select('light')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
  it('survives storage security errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    dispose = initializeTheme()
    select('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  it('provides one shared desktop/mobile native selector with accessible names and Escape focus', () => {
    dispose = initializeTheme()
    const menu = document.querySelector<HTMLDetailsElement>('.appearance-menu')!
    const summary = menu.querySelector('summary')!
    expect(summary.getAttribute('aria-label')).toBe('Apariencia: Sistema')
    expect(menu.querySelector('legend')?.textContent).toBe('Tema visual')
    expect(
      [...menu.querySelectorAll('label')].map((label) =>
        label.textContent?.trim(),
      ),
    ).toEqual(['Sistema', 'Claro', 'Oscuro'])
    menu.open = true
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })
  it('cleans up OS, radio, and document listeners', () => {
    dispose = initializeTheme()
    dispose()
    expect(listeners.size).toBe(0)
    osChange(true)
    select('dark')
    expect(document.documentElement.dataset.theme).toBe('light')
    const menu = document.querySelector<HTMLDetailsElement>('.appearance-menu')!
    menu.open = true
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu.open).toBe(true)
  })
  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['invalid', true, 'dark'],
  ])(
    'bootstrap resolves %s / OS %s before runtime',
    (preference, osDark, effective) => {
      localStorage.setItem(THEME_KEY, preference as string)
      dark = osDark as boolean
      const script = document.querySelector('script[data-theme-bootstrap]')!
      expect(script.parentElement).toBe(document.head)
      expect(source.indexOf('data-theme-bootstrap')).toBeLessThan(
        source.indexOf('src="/main.ts"'),
      )
      new Function(
        'document',
        'localStorage',
        'matchMedia',
        script.textContent!,
      )(document, localStorage, window.matchMedia)
      expect(document.documentElement.dataset.theme).toBe(effective)
      expect(document.documentElement.style.backgroundColor).not.toBe('')
      const bootstrapColor = document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content')
      dispose = initializeTheme()
      expect(document.documentElement.dataset.theme).toBe(effective)
      expect(
        document
          .querySelector('meta[name="theme-color"]')
          ?.getAttribute('content'),
      ).toBe(bootstrapColor)
    },
  )
  it('bootstrap tolerates missing storage', () => {
    const script = document.querySelector('script[data-theme-bootstrap]')!
    expect(() =>
      new Function(
        'document',
        'localStorage',
        'matchMedia',
        script.textContent!,
      )(document, undefined, () => ({ matches: true })),
    ).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
