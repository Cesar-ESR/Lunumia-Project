import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Category } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieCategoryRepository } from '@infrastructure/local/repositories/DexieCategoryRepository'
import { InitializeLocalOwner } from './InitializeLocalOwner'

const ownerId = 'guest:20000000-0000-4000-8000-000000000002'
const instant = '2026-08-09T00:00:00.000Z'
let database: GastoClaroDB

beforeEach(() => {
  database = new GastoClaroDB(`initialize-owner-${crypto.randomUUID()}`)
})

afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

describe('InitializeLocalOwner con historial Dexie', () => {
  it('backfill de un guest existente con solo Sin categoría produce diez categorías activas', async () => {
    await database.categories.add(systemCategory())

    await initializer().execute()

    const active = await repository().findAll()
    expect(active).toHaveLength(10)
    expect(active.filter(({ isSystem }) => !isSystem)).toHaveLength(9)
  })

  it('no recrea el nombre original después de renombrar un starter', async () => {
    const initialize = initializer()
    const categories = repository()
    await initialize.execute()
    const food = await categories.findByNormalizedName('Alimentación')
    if (!food) throw new Error('No se creó Alimentación.')
    await categories.update({
      ...food,
      name: 'Comida',
      normalizedName: 'comida',
      updatedAt: '2026-08-10T00:00:00.000Z',
      syncStatus: 'pending',
    })

    await initialize.execute()

    expect(await categories.findByNormalizedName('Alimentación')).toBeNull()
    expect(await categories.findByNormalizedName('Comida')).toBeDefined()
    expect((await categories.findAll()).filter(({ isSystem }) => !isSystem)).toHaveLength(9)
  })

  it('conserva el tombstone y no recrea un starter eliminado', async () => {
    const initialize = initializer()
    const categories = repository()
    await initialize.execute()
    const food = await categories.findByNormalizedName('Alimentación')
    if (!food) throw new Error('No se creó Alimentación.')
    await categories.delete(food.id)

    await initialize.execute()

    expect(await categories.findByNormalizedName('Alimentación')).toBeNull()
    expect((await categories.findAll()).filter(({ isSystem }) => !isSystem)).toHaveLength(8)
    expect(await categories.findAllIncludingDeleted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: food.id, deletedAt: instant }),
      ]),
    )
  })
})

function repository(): DexieCategoryRepository {
  return new DexieCategoryRepository(database, ownerId, {
    clock: { now: () => instant },
  })
}

function initializer(): InitializeLocalOwner {
  let sequence = 0
  return new InitializeLocalOwner(
    ownerId,
    {
      get: async () => ({
        id: 'settings',
        ownerId,
        activePeriodId: null,
        currency: 'MXN',
        theme: 'system',
        createdAt: instant,
        updatedAt: instant,
      }),
      upsert: async (value) => value,
    },
    repository(),
    { generate: () => `category-${sequence++}` },
    { now: () => instant },
  )
}

function systemCategory(): Category {
  return {
    id: 'system-category',
    ownerId,
    name: 'Sin categoría',
    normalizedName: 'sin categoría',
    color: '#64748B',
    icon: 'inbox',
    isSystem: true,
    createdAt: instant,
    updatedAt: instant,
    deletedAt: null,
    syncStatus: 'pending',
  }
}
