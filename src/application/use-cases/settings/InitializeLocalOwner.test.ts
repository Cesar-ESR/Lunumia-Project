import { describe, expect, it, vi } from 'vitest'
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
})
