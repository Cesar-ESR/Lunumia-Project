import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemePreference, UserSettings } from '@domain/entities'
import { ApplicationServicesProvider } from './ApplicationServicesContext'
import { ThemeProvider, useTheme } from './ThemeContext'
import { ThemeSettingsBridge } from '../components/ThemeSettingsBridge'
import { createApplicationServicesMock } from '../test/test-factories'
import { THEME_STORAGE_KEY } from '../theme/theme'

function installSystemTheme(initialDark: boolean) {
  let matches = initialDark
  const listeners = new Set<() => void>()
  const mediaQuery = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: () => void) =>
      listeners.add(listener),
    ),
    removeEventListener: vi.fn((_event: string, listener: () => void) =>
      listeners.delete(listener),
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } satisfies MediaQueryList
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery),
  )
  return {
    setDark(nextDark: boolean) {
      matches = nextDark
      listeners.forEach((listener) => listener())
    },
    mediaQuery,
  }
}

function ThemeProbe() {
  const theme = useTheme()
  return (
    <div>
      <output aria-label="Preferencia">{theme.preference}</output>
      <output aria-label="Tema efectivo">{theme.effectiveTheme}</output>
      <button type="button" onClick={() => theme.setPreference('light')}>
        Elegir claro
      </button>
      <button type="button" onClick={() => theme.setPreference('dark')}>
        Elegir oscuro
      </button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.themePreference
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ThemeProvider', () => {
  it('usa system por defecto y resuelve OS light', () => {
    installSystemTheme(false)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('Preferencia')).toHaveTextContent('system')
    expect(screen.getByLabelText('Tema efectivo')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('resuelve system con OS dark y reacciona a cambios del sistema', () => {
    const system = installSystemTheme(true)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(screen.getByLabelText('Tema efectivo')).toHaveTextContent('dark')

    act(() => system.setDark(false))

    expect(screen.getByLabelText('Tema efectivo')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it.each([
    ['light', true],
    ['dark', false],
  ] satisfies ReadonlyArray<readonly [ThemePreference, boolean]>)(
    'restaura la preferencia explícita %s sin depender del sistema',
    (preference, systemDark) => {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
      installSystemTheme(systemDark)
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      )

      expect(screen.getByLabelText('Preferencia')).toHaveTextContent(preference)
      expect(screen.getByLabelText('Tema efectivo')).toHaveTextContent(
        preference,
      )
    },
  )

  it('persiste el cambio inmediato y dark explícito ignora cambios del sistema', async () => {
    const user = userEvent.setup()
    const system = installSystemTheme(false)
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Elegir oscuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    act(() => system.setDark(true))
    act(() => system.setDark(false))

    expect(screen.getByLabelText('Tema efectivo')).toHaveTextContent('dark')
    expect(system.mediaQuery.removeEventListener).toHaveBeenCalled()
  })
})

describe('ThemeSettingsBridge', () => {
  it.each([
    ['guest:owner', 'dark'],
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'light'],
  ] satisfies ReadonlyArray<readonly [string, ThemePreference]>)(
    'restaura user_settings para owner %s con tema %s',
    async (ownerId, preference) => {
      installSystemTheme(false)
      const { services } = createApplicationServicesMock()
      services.ownerId = ownerId
      const storedSettings: UserSettings = {
        ...(await services.settings.getUserSettings.execute())!,
        ownerId,
        theme: preference,
      }
      vi.mocked(services.settings.getUserSettings.execute).mockResolvedValue(
        storedSettings,
      )

      render(
        <ThemeProvider>
          <ApplicationServicesProvider services={services}>
            <ThemeSettingsBridge>
              <ThemeProbe />
            </ThemeSettingsBridge>
          </ApplicationServicesProvider>
        </ThemeProvider>,
      )

      await waitFor(() =>
        expect(screen.getByLabelText('Preferencia')).toHaveTextContent(
          preference,
        ),
      )
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(preference)
    },
  )
})
