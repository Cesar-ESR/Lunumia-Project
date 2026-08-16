import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { BalanceAnchor } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieBalanceAnchorRepository } from './DexieBalanceAnchorRepository'

const ownerId = 'owner-a'
const otherOwnerId = 'owner-b'
const authenticatedOwnerId = '10000000-0000-4000-8000-000000000001'
const capturedAt = '2026-08-15T12:00:00.000Z'
const updatedAt = '2026-08-15T12:05:00.000Z'
const lowId = '00000000-0000-4000-8000-000000000001'
const highId = '00000000-0000-4000-8000-000000000002'
let sequence = 0
let database: GastoClaroDB | undefined

const anchor = (
  id: string,
  overrides: Partial<BalanceAnchor> = {},
): BalanceAnchor => ({
  id,
  ownerId,
  amount: 100_000,
  capturedAt,
  ledgerCutoffAt: '2026-08-15T11:59:59.999Z',
  createdAt: '2026-08-15T12:00:00.000Z',
  updatedAt,
  deletedAt: null,
  syncStatus: 'pending',
  ...overrides,
})

const setup = (scenario: string) => {
  database = new GastoClaroDB(`balance-anchor-${scenario}-${sequence++}`)
  return {
    database,
    repository: new DexieBalanceAnchorRepository(database, ownerId),
  }
}

afterEach(async () => {
  if (!database) return
  const name = database.name
  database.close()
  database = undefined
  await Dexie.delete(name)
})

describe('DexieBalanceAnchorRepository', () => {
  it.each([100_000, 0, -25_000])(
    'create persiste exactamente un signed amount de %s',
    async (amount) => {
      const { database, repository } = setup(`create-${amount}`)
      const value = anchor(lowId, { amount })

      expect(await repository.create(value)).toEqual(value)
      expect(await database.balanceAnchors.get(value.id)).toEqual(value)
      expect(await database.syncOperations.count()).toBe(0)
    },
  )

  it('create rechaza un anchor de otro owner sin persistirlo', async () => {
    const { database, repository } = setup('create-owner')
    const value = anchor(lowId, { ownerId: otherOwnerId })

    await expect(repository.create(value)).rejects.toThrow(
      /no pertenece al propietario/,
    )
    expect(await database.balanceAnchors.count()).toBe(0)
  })

  it('crea entidad y operación de sync atómicamente para un owner autenticado', async () => {
    database = new GastoClaroDB(`balance-anchor-sync-${sequence++}`)
    const value = anchor(lowId, { ownerId: authenticatedOwnerId, amount: -25 })
    const repository = new DexieBalanceAnchorRepository(
      database,
      authenticatedOwnerId,
      {
        ids: { generate: () => highId },
        clock: { now: () => updatedAt },
      },
    )

    await repository.create(value)
    expect(await database.syncOperations.get(highId)).toMatchObject({
      ownerId: authenticatedOwnerId,
      entityType: 'balanceAnchor',
      entityId: lowId,
      operationType: 'create',
      payload: JSON.stringify(value),
    })
  })

  it('revierte el anchor si no puede generar una operación válida', async () => {
    database = new GastoClaroDB(`balance-anchor-rollback-${sequence++}`)
    const value = anchor(lowId, { ownerId: authenticatedOwnerId })
    const repository = new DexieBalanceAnchorRepository(
      database,
      authenticatedOwnerId,
      { ids: { generate: () => 'operation-invalida' } },
    )

    await expect(repository.create(value)).rejects.toThrow(/UUID/)
    expect(await database.balanceAnchors.count()).toBe(0)
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('conserva el anchor después de cerrar y reabrir la DB', async () => {
    const { database: initial, repository } = setup('reopen')
    const value = anchor(lowId)
    await repository.create(value)
    const name = initial.name
    initial.close()

    database = new GastoClaroDB(name)
    await database.open()
    const reopened = new DexieBalanceAnchorRepository(database, ownerId)

    expect(await reopened.findById(value.id)).toEqual(value)
  })

  it('findLatest devuelve null cuando no hay anchors', async () => {
    const { repository } = setup('empty')

    expect(await repository.findLatest()).toBeNull()
  })

  it('findLatest devuelve el único anchor activo', async () => {
    const { repository } = setup('one')
    const value = anchor(lowId)
    await repository.create(value)

    expect(await repository.findLatest()).toEqual(value)
  })

  it('prioriza capturedAt descendente sobre updatedAt', async () => {
    const { database, repository } = setup('captured-at')
    const olderCapture = anchor(lowId, {
      capturedAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    })
    const newerCapture = anchor(highId, {
      capturedAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    })
    await database.balanceAnchors.bulkAdd([olderCapture, newerCapture])

    expect(await repository.findLatest()).toEqual(newerCapture)
  })

  it('usa updatedAt descendente cuando capturedAt empata', async () => {
    const { database, repository } = setup('updated-at')
    const olderUpdate = anchor(lowId, {
      updatedAt: '2026-08-15T12:01:00.000Z',
    })
    const newerUpdate = anchor(highId, {
      updatedAt: '2026-08-15T12:02:00.000Z',
    })
    await database.balanceAnchors.bulkAdd([newerUpdate, olderUpdate])

    expect(await repository.findLatest()).toEqual(newerUpdate)
  })

  it('usa id descendente cuando capturedAt y updatedAt empatan', async () => {
    const { database, repository } = setup('id')
    const lower = anchor(lowId, {
      createdAt: '2026-08-20T00:00:00.000Z',
    })
    const higher = anchor(highId, {
      createdAt: '2026-08-10T00:00:00.000Z',
    })
    await database.balanceAnchors.bulkAdd([higher, lower])

    expect(await repository.findLatest()).toEqual(higher)
  })

  it('ignora el anchor cronológicamente más reciente si es tombstone', async () => {
    const { database, repository } = setup('latest-tombstone')
    const active = anchor(lowId, {
      capturedAt: '2026-08-10T00:00:00.000Z',
    })
    const tombstone = anchor(highId, {
      capturedAt: '2026-08-20T00:00:00.000Z',
      deletedAt: '2026-08-21T00:00:00.000Z',
    })
    await database.balanceAnchors.bulkAdd([tombstone, active])

    expect(await repository.findLatest()).toEqual(active)
  })

  it('devuelve null cuando todos los anchors son tombstones', async () => {
    const { database, repository } = setup('all-tombstones')
    await database.balanceAnchors.bulkAdd([
      anchor(lowId, { deletedAt: '2026-08-20T00:00:00.000Z' }),
      anchor(highId, { deletedAt: '2026-08-21T00:00:00.000Z' }),
    ])

    expect(await repository.findLatest()).toBeNull()
    expect(await repository.findById(highId)).toBeNull()
  })

  it('aísla findLatest y findById por owner', async () => {
    const { database, repository } = setup('owners')
    const own = anchor(lowId, {
      capturedAt: '2026-08-10T00:00:00.000Z',
    })
    const foreign = anchor(highId, {
      ownerId: otherOwnerId,
      capturedAt: '2026-08-20T00:00:00.000Z',
    })
    await database.balanceAnchors.bulkAdd([foreign, own])

    expect(await repository.findLatest()).toEqual(own)
    expect(await repository.findById(own.id)).toEqual(own)
    expect(await repository.findById(foreign.id)).toBeNull()
  })
})
