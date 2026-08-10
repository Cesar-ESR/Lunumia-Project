import { describe, expect, it, vi } from 'vitest'
import {
  CategoryDuplicateError,
  SystemCategoryProtectedError,
} from '@domain/errors'
import { CreateCategory } from './CreateCategory'
import { UpdateCategory } from './UpdateCategory'
import { DeleteCategory } from './DeleteCategory'

const clock = { now: () => '2026-01-01T00:00:00.000Z' }
const ids = { generate: () => '00000000-0000-4000-8000-000000000001' }
const input = { ownerId: 'owner', name: 'Comida', color: '#112233' }

describe('category use cases', () => {
  it('rejects a duplicate category', async () => {
    const repository = {
      findByNormalizedName: vi.fn().mockResolvedValue({ id: 'existing' }),
    }
    await expect(
      new CreateCategory(repository as never, ids, clock).execute(input),
    ).rejects.toBeInstanceOf(CategoryDuplicateError)
  })

  it('protects a system category', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({ id: 'system', isSystem: true }),
    }
    await expect(
      new DeleteCategory(repository as never, {
        reassignAndDelete: vi.fn(),
      }).execute('system'),
    ).rejects.toBeInstanceOf(SystemCategoryProtectedError)
  })

  it('delegates category reassignment and deletion as one transaction', async () => {
    const categories = {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'food', ownerId: 'owner', isSystem: false }),
      findSystemCategory: vi.fn().mockResolvedValue({
        id: 'uncategorized',
        ownerId: 'owner',
        isSystem: true,
      }),
    }
    const transaction = { reassignAndDelete: vi.fn() }

    await new DeleteCategory(categories as never, transaction).execute('food')

    expect(transaction.reassignAndDelete).toHaveBeenCalledWith(
      'food',
      'uncategorized',
    )
  })

  it('normalizes an update', async () => {
    const current = {
      id: 'category',
      ownerId: 'owner',
      name: 'Old',
      normalizedName: 'old',
      color: '#000000',
      icon: null,
      isSystem: false,
      createdAt: clock.now(),
      updatedAt: clock.now(),
      deletedAt: null,
      syncStatus: 'synced' as const,
    }
    const repository = {
      findById: vi.fn().mockResolvedValue(current),
      findByNormalizedName: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation(async (value) => value),
    }
    const result = await new UpdateCategory(repository as never, clock).execute(
      'category',
      input,
    )
    expect(result.normalizedName).toBe('comida')
  })
})
