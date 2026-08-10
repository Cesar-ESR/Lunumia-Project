import { afterEach, describe, expect, it } from 'vitest'
import { APP_NAME } from '@shared/constants'
import {
  getOrCreateGuestOwnerId,
  type KeyValueStorage,
} from './GuestOwnerStore'
import { GastoClaroDB } from './database'

const databases: GastoClaroDB[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('compatibilidad del rebranding a Lunumia', () => {
  it('cambia la marca visible sin renombrar la base IndexedDB histórica', () => {
    const database = new GastoClaroDB()
    databases.push(database)

    expect(APP_NAME).toBe('Lunumia')
    expect(database.name).toBe('GastoClaroDB')
  })

  it('reabre la misma base y conserva los registros existentes', async () => {
    const databaseName = `GastoClaroDB-rebrand-${crypto.randomUUID()}`
    const first = new GastoClaroDB(databaseName)
    await first.userSettings.put({
      id: 'settings-before-rebrand',
      ownerId: 'guest:before-rebrand',
      activePeriodId: null,
      currency: 'MXN',
      theme: 'system',
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    })
    first.close()

    const reopened = new GastoClaroDB(databaseName)
    databases.push(reopened)

    await expect(
      reopened.userSettings.get('settings-before-rebrand'),
    ).resolves.toMatchObject({
      ownerId: 'guest:before-rebrand',
      currency: 'MXN',
    })
  })

  it('continúa leyendo la clave local histórica del propietario invitado', () => {
    const values = new Map([
      ['gastoclaro.guest-owner-id', 'guest:before-rebrand'],
    ])
    const storage: KeyValueStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }

    expect(getOrCreateGuestOwnerId(storage, () => 'new-id')).toBe(
      'guest:before-rebrand',
    )
    expect(values.has('lunumia.guest-owner-id')).toBe(false)
  })
})
