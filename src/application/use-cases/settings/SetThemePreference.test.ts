import { describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@domain/entities'
import type { UserSettingsStore } from '@application/use-cases/periods/SetActivePeriod'
import { SetThemePreference } from './SetThemePreference'

const settings: UserSettings = {
  id: 'settings-1',
  ownerId: 'guest:owner',
  activePeriodId: null,
  currency: 'MXN',
  theme: 'system',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

describe('SetThemePreference', () => {
  it('preserva la configuración y actualiza tema y timestamp', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(settings),
      upsert: vi.fn().mockImplementation(async (value) => value),
    } satisfies UserSettingsStore
    const setTheme = new SetThemePreference(store, {
      now: () => '2026-09-04T12:00:00.000Z',
    })

    await expect(setTheme.execute('dark')).resolves.toEqual({
      ...settings,
      theme: 'dark',
      updatedAt: '2026-09-04T12:00:00.000Z',
    })
    expect(store.upsert).toHaveBeenCalledOnce()
  })

  it('rechaza la escritura si la configuración aún no existe', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    } satisfies UserSettingsStore
    const setTheme = new SetThemePreference(store, {
      now: () => '2026-09-04T12:00:00.000Z',
    })

    await expect(setTheme.execute('light')).rejects.toThrow(
      'todavía no está disponible',
    )
    expect(store.upsert).not.toHaveBeenCalled()
  })
})
