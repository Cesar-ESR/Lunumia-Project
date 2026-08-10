import { describe, expect, it, vi } from 'vitest'
import type { Period, UserSettings } from '@domain/entities'
import type { IPeriodRepository } from '@domain/repositories'
import { SetActivePeriod, type UserSettingsStore } from './SetActivePeriod'

const createdAt = '2026-01-15T12:00:00.000Z'
const period: Period = {
  id: 'period-1',
  ownerId: 'owner-1',
  type: 'monthly',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
  syncStatus: 'synced',
}
const settings: UserSettings = {
  id: 'settings-1',
  ownerId: 'owner-1',
  activePeriodId: null,
  currency: 'MXN',
  theme: 'system',
  createdAt,
  updatedAt: createdAt,
}

describe('SetActivePeriod', () => {
  it('saves the active period and preserves current settings', async () => {
    const periods = { findById: vi.fn().mockResolvedValue(period) } as Pick<
      IPeriodRepository,
      'findById'
    >
    const store = {
      get: vi.fn().mockResolvedValue(settings),
      upsert: vi.fn().mockImplementation(async (value: UserSettings) => value),
    } satisfies UserSettingsStore

    const result = await new SetActivePeriod(
      periods as IPeriodRepository,
      store,
      { now: () => '2026-01-16T00:00:00.000Z' },
    ).execute(period.id)

    expect(result.activePeriodId).toBe(period.id)
    expect(result.updatedAt).toBe('2026-01-16T00:00:00.000Z')
    expect(store.upsert).toHaveBeenCalledOnce()
  })

  it('rejects a missing period', async () => {
    const periods = { findById: vi.fn().mockResolvedValue(null) } as Pick<
      IPeriodRepository,
      'findById'
    >
    const store = {
      get: vi.fn(),
      upsert: vi.fn(),
    } as unknown as UserSettingsStore

    await expect(
      new SetActivePeriod(periods as IPeriodRepository, store, {
        now: () => createdAt,
      }).execute('missing'),
    ).rejects.toThrow('no existe')
    expect(store.get).not.toHaveBeenCalled()
  })
})
