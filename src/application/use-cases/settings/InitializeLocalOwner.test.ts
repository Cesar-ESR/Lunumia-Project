import { describe, expect, it, vi } from 'vitest'
import type { Category } from '@domain/entities'
import { STARTER_CATEGORY_TEMPLATES } from '@application/use-cases/categories/starter-category-templates'
import { InitializeLocalOwner } from './InitializeLocalOwner'

const ownerId = '20000000-0000-4000-8000-000000000002'
const instant = '2026-08-09T00:00:00.000Z'

describe('InitializeLocalOwner', () => {
  it('reutiliza settings y categoría del owner al volver a entrar sin duplicar defaults', async () => {
    const settings = {
      get: vi.fn(async () => ({
        id: 'settings-existing',
        ownerId,
        activePeriodId: 'period-existing',
        currency: 'MXN' as const,
        theme: 'system' as const,
        createdAt: instant,
        updatedAt: instant,
      })),
      upsert: vi.fn(),
    }
    const categories = {
      findAll: vi.fn(async () => [
        {
          id: 'category-existing',
          ownerId,
          name: 'Sin categoría',
          normalizedName: 'sin categoría',
          color: '#64748B',
          icon: 'inbox',
          isSystem: true,
          createdAt: instant,
          updatedAt: instant,
          deletedAt: null,
          syncStatus: 'pending' as const,
        },
      ]),
      findAllIncludingDeleted: vi.fn(async () => [
        {
          id: 'category-existing',
          ownerId,
          name: 'Sin categoría',
          normalizedName: 'sin categoría',
          color: '#64748B',
          icon: 'inbox',
          isSystem: true,
          createdAt: instant,
          updatedAt: instant,
          deletedAt: null,
          syncStatus: 'pending' as const,
        },
      ]),
      create: vi.fn(),
    }
    const ids = { generate: vi.fn(() => 'unexpected-default-id') }
    const initialize = new InitializeLocalOwner(
      ownerId,
      settings,
      categories as never,
      ids,
      { now: () => instant },
    )

    await initialize.execute()
    await initialize.execute()

    expect(settings.upsert).not.toHaveBeenCalled()
    expect(categories.create).not.toHaveBeenCalled()
    expect(ids.generate).not.toHaveBeenCalled()
  })

  it('crea exactamente nueve categorías iniciales para un guest nuevo y no las duplica', async () => {
    const categories: Category[] = []
    const repository = {
      findAllIncludingDeleted: vi.fn(async () => [...categories]),
      create: vi.fn(async (category: Category) => {
        categories.push(category)
        return category
      }),
    }
    let sequence = 0
    const initialize = new InitializeLocalOwner(
      'guest:new-owner',
      { get: vi.fn(async () => ({ id: 'settings' })), upsert: vi.fn() } as never,
      repository as never,
      { generate: () => `category-${sequence++}` },
      { now: () => instant },
    )

    await initialize.execute()
    await initialize.execute()

    expect(categories.filter(({ isSystem }) => isSystem)).toHaveLength(1)
    expect(categories.filter(({ isSystem }) => !isSystem)).toEqual(
      STARTER_CATEGORY_TEMPLATES.map((template) =>
        expect.objectContaining({ ...template, isSystem: false }),
      ),
    )
  })

  it.each([
    ['activa', null],
    ['borrada', '2026-08-08T00:00:00.000Z'],
  ])(
    'no recrea starters cuando existe historia ordinaria %s',
    async (_label, deletedAt) => {
      const existing: Category = {
        id: 'custom',
        ownerId: 'guest:existing-owner',
        name: 'Comida casera',
        normalizedName: 'comida casera',
        color: '#123456',
        icon: null,
        isSystem: false,
        createdAt: instant,
        updatedAt: instant,
        deletedAt,
        syncStatus: 'pending',
      }
      const create = vi.fn()
      const initialize = new InitializeLocalOwner(
        existing.ownerId,
        { get: vi.fn(async () => ({ id: 'settings' })), upsert: vi.fn() } as never,
        {
          findAllIncludingDeleted: vi.fn(async () => [
            { ...existing, id: 'system', name: 'Sin categoría', isSystem: true, deletedAt: null },
            existing,
          ]),
          create,
        } as never,
        { generate: vi.fn(() => 'unexpected') },
        { now: () => instant },
      )

      await initialize.execute()

      expect(create).not.toHaveBeenCalled()
    },
  )

  it('no crea categorías ordinarias para un owner autenticado sin historial local', async () => {
    const created: Category[] = []
    const initialize = new InitializeLocalOwner(
      ownerId,
      { get: vi.fn(async () => ({ id: 'settings' })), upsert: vi.fn() } as never,
      {
        findAllIncludingDeleted: vi.fn(async () => []),
        create: vi.fn(async (category: Category) => {
          created.push(category)
          return category
        }),
      } as never,
      { generate: vi.fn(() => 'system') },
      { now: () => instant },
    )

    await initialize.execute()

    expect(created).toEqual([expect.objectContaining({ isSystem: true })])
  })
})
