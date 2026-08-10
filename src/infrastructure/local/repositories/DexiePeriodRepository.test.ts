import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Period } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexiePeriodRepository } from './DexiePeriodRepository'

let sequence = 0
let database: GastoClaroDB | undefined
const period = (
  id: string,
  ownerId = 'owner',
  startDate = '2026-01-01',
  endDate = '2026-01-31',
): Period => ({
  id,
  ownerId,
  type: 'monthly',
  startDate,
  endDate,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
})

afterEach(async () => {
  if (database) {
    database.close()
    await Dexie.delete(database.name)
    database = undefined
  }
})

describe('DexiePeriodRepository', () => {
  it('persiste y recupera solo periodos activos del propietario', async () => {
    database = new GastoClaroDB(`periods-${sequence++}`)
    const repository = new DexiePeriodRepository(database, 'owner')
    await repository.create(period('first'))
    await database.periods.add({
      ...period('other', 'other-owner'),
      deletedAt: null,
    })
    await database.periods.add({
      ...period('deleted'),
      deletedAt: '2026-01-02T00:00:00.000Z',
    })
    expect((await repository.findAll()).map((value) => value.id)).toEqual([
      'first',
    ])
  })
  it('detecta solapamiento inclusivo y permite excluir el mismo periodo', async () => {
    database = new GastoClaroDB(`periods-${sequence++}`)
    const repository = new DexiePeriodRepository(database, 'owner')
    await repository.create(period('first'))
    expect(
      (await repository.findOverlapping('2026-01-31', '2026-02-10')).map(
        (value) => value.id,
      ),
    ).toEqual(['first'])
    expect(
      await repository.findOverlapping('2026-01-31', '2026-02-10', 'first'),
    ).toEqual([])
  })
})
