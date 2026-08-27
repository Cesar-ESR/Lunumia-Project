import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Category, Expense } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieCategoryRepository } from './DexieCategoryRepository'

let database: GastoClaroDB | undefined
const base = {
  ownerId: 'owner',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced' as const,
}
const category = (id: string, name: string, isSystem = false): Category => ({
  ...base,
  id,
  name,
  normalizedName: name.trim().toLowerCase(),
  color: '#000000',
  icon: null,
  isSystem,
})
afterEach(async () => {
  if (database) {
    database.close()
    await Dexie.delete(database.name)
    database = undefined
  }
})
describe('DexieCategoryRepository', () => {
  it('busca nombres normalizados y la categoría de sistema', async () => {
    database = new GastoClaroDB('categories-test')
    const repository = new DexieCategoryRepository(database, 'owner')
    await repository.create(category('food', 'Comida'))
    await repository.create(category('uncategorized', 'Sin categoría', true))
    expect((await repository.findByNormalizedName(' comida '))?.id).toBe('food')
    expect((await repository.findSystemCategory()).id).toBe('uncategorized')
  })
  it('cuenta solo gastos activos del mismo propietario', async () => {
    database = new GastoClaroDB('categories-count-test')
    const repository = new DexieCategoryRepository(database, 'owner')
    const expense: Expense = {
      ...base,
      id: 'expense',
      periodId: 'period',
      categoryId: 'food',
      amount: 100,
      description: '',
      date: '2026-01-01',
      recurringOccurrenceId: null,
    }
    await database.expenses.add(expense)
    await database.expenses.add({
      ...expense,
      id: 'deleted',
      deletedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(await repository.countExpensesByCategory('food')).toBe(1)
  })
  it('expone el historial borrado solo mediante la consulta explícita', async () => {
    database = new GastoClaroDB('categories-history-test')
    const repository = new DexieCategoryRepository(database, 'owner', {
      clock: { now: () => '2026-01-02T00:00:00.000Z' },
    })
    await repository.create(category('food', 'Comida'))
    await repository.delete('food')

    expect(await repository.findAll()).toEqual([])
    expect(await repository.findAllIncludingDeleted()).toEqual([
      expect.objectContaining({ id: 'food', deletedAt: '2026-01-02T00:00:00.000Z' }),
    ])
  })
})
