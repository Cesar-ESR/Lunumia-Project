import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { CategoryBudget } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieCategoryBudgetRepository } from './DexieCategoryBudgetRepository'

let database: GastoClaroDB | undefined
const budget = (
  id: string,
  amount: number,
  categoryId = 'category',
): CategoryBudget => ({
  id,
  ownerId: 'owner',
  periodId: 'period',
  categoryId,
  amount,
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
describe('DexieCategoryBudgetRepository', () => {
  it('create/delete/recreate/adjust/reload preserves one active ID and the tombstone', async () => {
    database = new GastoClaroDB('budget-recreate')
    const repo = new DexieCategoryBudgetRepository(database, 'owner')
    await repo.upsert(budget('a', 100000))
    expect(await repo.findByPeriod('period')).toHaveLength(1)
    await repo.delete('a')
    expect(await repo.findByPeriod('period')).toHaveLength(0)
    await repo.upsert(budget('b', 100000))
    const updated = await repo.upsert(budget('c', 110000))
    expect(updated.id).toBe('b')
    database.close()
    await database.open()
    expect(await repo.findByPeriod('period')).toEqual([updated])
    expect(await database.categoryBudgets.count()).toBe(2)
    expect((await database.categoryBudgets.get('a'))?.deletedAt).not.toBeNull()
  })
  it('serializes concurrent upserts without creating a second active record', async () => {
    database = new GastoClaroDB('budget-concurrent')
    const repo = new DexieCategoryBudgetRepository(database, 'owner')
    await Promise.all([
      repo.upsert(budget('a', 100000)),
      repo.upsert(budget('b', 110000)),
    ])
    expect(await repo.findByPeriod('period')).toHaveLength(1)
  })
  it('fails closed on existing duplicates without mutating amounts or tombstones', async () => {
    database = new GastoClaroDB('budget-legacy-duplicate')
    const repo = new DexieCategoryBudgetRepository(database, 'owner')
    await database.categoryBudgets.bulkAdd([
      budget('a', 100000),
      budget('b', 110000),
    ])
    const before = await database.categoryBudgets.toArray()
    await expect(repo.upsert(budget('c', 120000))).rejects.toThrow('duplicados')
    await expect(repo.findByPeriod('period')).rejects.toThrow('duplicados')
    await expect(
      repo.findByPeriodAndCategory('period', 'category'),
    ).rejects.toThrow('duplicados')
    expect(await database.categoryBudgets.toArray()).toEqual(before)
    expect(await database.syncOperations.count()).toBe(0)
  })
  it('actualiza el presupuesto existente sin duplicarlo', async () => {
    database = new GastoClaroDB('budget-test')
    const repository = new DexieCategoryBudgetRepository(database, 'owner')
    const first = await repository.upsert(budget('first', 100))
    expect(await repository.findById(first.id)).toEqual(first)
    const updated = await repository.upsert(budget('new-id', 200))
    expect(updated.id).toBe(first.id)
    expect(
      (await repository.findByPeriod('period')).map((value) => value.amount),
    ).toEqual([200])
  })
  it('soft-deletes a budget without allowing it to be read again', async () => {
    database = new GastoClaroDB('budget-delete-test')
    const repository = new DexieCategoryBudgetRepository(database, 'owner')
    const created = await repository.upsert(budget('budget', 100))
    await repository.delete(created.id)
    expect(await repository.findById(created.id)).toBeNull()
    expect(
      await repository.findByPeriodAndCategory('period', 'category'),
    ).toBeNull()
    expect(await repository.findByPeriod('period')).toEqual([])
  })
})
