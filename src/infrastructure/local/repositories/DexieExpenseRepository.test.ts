import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Expense } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieExpenseRepository } from './DexieExpenseRepository'

let database: GastoClaroDB | undefined
const expense = (
  id: string,
  categoryId = 'category',
  ownerId = 'owner',
): Expense => ({
  id,
  ownerId,
  periodId: 'period',
  categoryId,
  amount: 100,
  description: '',
  date: '2026-01-01',
  recurringOccurrenceId: null,
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
describe('DexieExpenseRepository', () => {
  it('filtra consultas por periodo, categoría y propietario', async () => {
    database = new GastoClaroDB('expenses-list-test')
    const repository = new DexieExpenseRepository(database, 'owner')
    await repository.create(expense('first'))
    await repository.create(expense('second', 'other-category'))
    await database.expenses.add(expense('other', 'category', 'other-owner'))
    expect(
      (await repository.findByPeriod('period')).map((value) => value.id),
    ).toEqual(['first', 'second'])
    expect(
      (await repository.findByCategory('category')).map((value) => value.id),
    ).toEqual(['first'])
  })
  it('oculta gastos eliminados lógicamente', async () => {
    database = new GastoClaroDB('expenses-delete-test')
    const repository = new DexieExpenseRepository(database, 'owner')
    await repository.create(expense('expense'))
    await repository.delete('expense')
    expect(await repository.findById('expense')).toBeNull()
  })
  it('findAll devuelve solo registros activos del owner sin normalizarlos', async () => {
    database = new GastoClaroDB('expenses-find-all-test')
    const repository = new DexieExpenseRepository(database, 'owner')
    const active = expense('active')
    await database.expenses.bulkAdd([
      active,
      {
        ...expense('deleted'),
        deletedAt: '2026-01-04T00:00:00.000Z',
      },
      expense('other-owner', 'category', 'other'),
    ])

    const result = await repository.findAll()

    expect(result).toEqual([active])
    expect(result[0]).not.toHaveProperty('affectsBalance')
    expect(result[0]).not.toHaveProperty('balanceEffectiveAt')
  })
})
