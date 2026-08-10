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
