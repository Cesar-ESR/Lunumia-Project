import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { GastoClaroDB } from '../database'
import {
  DexieDeviceSyncStateRepository,
  DexieUserSettingsRepository,
} from './DexieSettingsRepositories'
import { SetThemePreference } from '@application/use-cases/settings/SetThemePreference'
let database: GastoClaro | undefined
type GastoClaro = GastoClaroDB
afterEach(async () => {
  if (database) {
    database.close()
    await Dexie.delete(database.name)
    database = undefined
  }
})
describe('repositorios de configuración local', () => {
  it('mantiene un único settings por propietario', async () => {
    database = new GastoClaroDB('settings-test')
    const repository = new DexieUserSettingsRepository(database, 'owner')
    await repository.upsert({
      id: 'one',
      ownerId: 'owner',
      activePeriodId: null,
      currency: 'MXN',
      theme: 'light',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const updated = await repository.upsert({
      id: 'two',
      ownerId: 'owner',
      activePeriodId: 'period',
      currency: 'USD',
      theme: 'dark',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(updated.id).toBe('one')
    expect((await repository.get())?.currency).toBe('USD')
  })
  it('persiste el tema localmente y encola el cambio para un propietario autenticado', async () => {
    const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    database = new GastoClaroDB('authenticated-theme-settings-test')
    await database.userSettings.add({
      id: '88888888-8888-4888-8888-888888888888',
      ownerId,
      activePeriodId: null,
      currency: 'MXN',
      theme: 'system',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const repository = new DexieUserSettingsRepository(database, ownerId, {
      ids: {
        generate: () => '99999999-9999-4999-8999-999999999999',
      },
      clock: { now: () => '2026-01-02T00:00:00.000Z' },
    })
    const setTheme = new SetThemePreference(repository, {
      now: () => '2026-01-02T00:00:00.000Z',
    })

    const updated = await setTheme.execute('dark')
    const queued = await database.syncOperations.toArray()

    expect(updated.theme).toBe('dark')
    expect((await repository.get())?.theme).toBe('dark')
    expect(queued).toHaveLength(1)
    const operation = queued[0]!
    expect(operation).toMatchObject({
      ownerId,
      entityType: 'userSettings',
      entityId: updated.id,
      operationType: 'update',
      status: 'pending',
    })
    expect(JSON.parse(operation.payload)).toMatchObject({ theme: 'dark' })
  })
  it('guarda cursores independientes por propietario y entidad', async () => {
    database = new GastoClaroDB('device-state-test')
    const repository = new DexieDeviceSyncStateRepository(database, 'owner')
    await repository.upsert({
      id: 'expense-state',
      ownerId: 'owner',
      entityType: 'expense',
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      lastEntityId: 'expense',
      lastSuccessfulSyncAt: null,
    })
    await repository.upsert({
      id: 'income-state',
      ownerId: 'owner',
      entityType: 'income',
      lastUpdatedAt: null,
      lastEntityId: null,
      lastSuccessfulSyncAt: null,
    })
    expect((await repository.get('expense'))?.lastEntityId).toBe('expense')
    expect(await repository.list()).toHaveLength(2)
  })
})
