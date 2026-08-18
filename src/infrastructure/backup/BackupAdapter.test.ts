import { afterEach, describe, expect, it } from 'vitest'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  BACKUP_NOW,
  BALANCE_ANCHOR_ID,
  CATEGORY_ID,
  createBackupData,
} from '../../../tests/backup-fixtures'
import { BackupAdapter } from './BackupAdapter'
import { DexieBalanceAnchorRepository } from '@infrastructure/local/repositories'

const databases: GastoClaroDB[] = []

function createDatabase(): GastoClaroDB {
  const database = new GastoClaroDB(`backup-adapter-${crypto.randomUUID()}`)
  databases.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('BackupAdapter', () => {
  it('lee todas las entidades activas del propietario en orden determinista', async () => {
    const database = createDatabase()
    const adapter = new BackupAdapter(database)
    await adapter.replace('guest:local', createBackupData('guest:source'))
    await database.categories.add({
      id: '99999999-9999-4999-8999-999999999999',
      ownerId: 'guest:other',
      name: 'Ajena',
      normalizedName: 'ajena',
      color: '#000000',
      icon: null,
      isSystem: false,
      createdAt: BACKUP_NOW,
      updatedAt: BACKUP_NOW,
      deletedAt: null,
      syncStatus: 'pending',
    })
    await database.expenses.add({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ownerId: 'guest:local',
      periodId: '11111111-1111-4111-8111-111111111111',
      categoryId: CATEGORY_ID,
      amount: 1,
      description: 'Eliminado',
      date: '2026-07-10',
      recurringOccurrenceId: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: BACKUP_NOW,
      deletedAt: BACKUP_NOW,
      syncStatus: 'pending',
    })
    await database.balanceAnchors.add({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      ownerId: 'guest:local',
      amount: -1,
      capturedAt: BACKUP_NOW,
      ledgerCutoffAt: BACKUP_NOW,
      createdAt: BACKUP_NOW,
      updatedAt: BACKUP_NOW,
      deletedAt: BACKUP_NOW,
      syncStatus: 'pending',
    })

    const result = await adapter.readActive('guest:local')
    expect(result.expenses).toHaveLength(1)
    expect(result.categories).toHaveLength(1)
    expect(result.balanceAnchors).toHaveLength(1)
    expect(
      Object.values(result).every((records) =>
        records.every(({ ownerId }) => ownerId === 'guest:local'),
      ),
    ).toBe(true)
  })

  it('reemplaza únicamente al propietario actual y reasigna todos los ownerId', async () => {
    const database = createDatabase()
    const adapter = new BackupAdapter(database)
    await database.categories.add({
      id: '99999999-9999-4999-8999-999999999999',
      ownerId: 'guest:other',
      name: 'Ajena',
      normalizedName: 'ajena',
      color: '#000000',
      icon: null,
      isSystem: false,
      createdAt: BACKUP_NOW,
      updatedAt: BACKUP_NOW,
      deletedAt: null,
      syncStatus: 'pending',
    })
    await adapter.replace(
      'guest:local',
      createBackupData('guest:exported-owner'),
    )

    const imported = await adapter.readActive('guest:local')
    expect(imported.userSettings[0]).toMatchObject({
      ownerId: 'guest:local',
      activePeriodId: '11111111-1111-4111-8111-111111111111',
    })
    expect(
      await database.categories.where('ownerId').equals('guest:other').count(),
    ).toBe(1)
    expect(
      Object.values(imported).every((records) =>
        records.every(({ ownerId }) => ownerId === 'guest:local'),
      ),
    ).toBe(true)
  })

  it('encola el estado importado de una cuenta autenticada dentro de la misma transacción', async () => {
    const database = createDatabase()
    const adapter = new BackupAdapter(database)
    const ownerId = '10000000-0000-4000-8000-000000000001'
    await adapter.replace(ownerId, createBackupData('guest:backup-owner'))
    const operations = await database.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .toArray()
    expect(operations).toHaveLength(9)
    expect(
      operations.every(
        ({ operationType, status }) =>
          operationType === 'create' && status === 'pending',
      ),
    ).toBe(true)
  })

  it('revierte toda la sustitución si una inserción falla', async () => {
    const database = createDatabase()
    const adapter = new BackupAdapter(database)
    await adapter.replace('guest:local', createBackupData('guest:old', 100))
    const collisionId = '99999999-9999-4999-8999-999999999999'
    await database.categories.add({
      id: collisionId,
      ownerId: 'guest:other',
      name: 'Ajena',
      normalizedName: 'ajena',
      color: '#000000',
      icon: null,
      isSystem: false,
      createdAt: BACKUP_NOW,
      updatedAt: BACKUP_NOW,
      deletedAt: null,
      syncStatus: 'pending',
    })
    const invalidAtWrite = createBackupData('guest:source', 999)
    invalidAtWrite.categories[0] = {
      ...invalidAtWrite.categories[0]!,
      id: collisionId,
    }
    invalidAtWrite.expenses[0] = {
      ...invalidAtWrite.expenses[0]!,
      categoryId: collisionId,
    }
    invalidAtWrite.categoryBudgets[0] = {
      ...invalidAtWrite.categoryBudgets[0]!,
      categoryId: collisionId,
    }
    invalidAtWrite.recurringPayments[0] = {
      ...invalidAtWrite.recurringPayments[0]!,
      categoryId: collisionId,
    }

    await expect(
      adapter.replace('guest:local', invalidAtWrite),
    ).rejects.toBeDefined()
    const retained = await adapter.readActive('guest:local')
    expect(retained.expenses[0]?.amount).toBe(100)
    expect(retained.categories[0]?.id).toBe(CATEGORY_ID)
  })

  it('preserva múltiples anchors firmados, remapea owner y conserva latest', async () => {
    const database = createDatabase()
    const adapter = new BackupAdapter(database)
    const data = createBackupData('guest:source')
    const original = data.balanceAnchors[0]!
    data.balanceAnchors = [
      {
        ...original,
        id: BALANCE_ANCHOR_ID,
        amount: 100,
        capturedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        ...original,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        amount: 0,
        capturedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        ...original,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        amount: -100,
        capturedAt: '2026-07-31T00:00:00.000Z',
      },
    ]

    await adapter.replace('guest:destination', data)

    const restored = await adapter.readActive('guest:destination')
    expect(restored.balanceAnchors.map(({ amount }) => amount)).toEqual([
      100, 0, -100,
    ])
    expect(
      restored.balanceAnchors.every(
        ({ ownerId }) => ownerId === 'guest:destination',
      ),
    ).toBe(true)
    const repository = new DexieBalanceAnchorRepository(
      database,
      'guest:destination',
    )
    await expect(repository.findLatest()).resolves.toMatchObject({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      amount: -100,
    })
  })
})
