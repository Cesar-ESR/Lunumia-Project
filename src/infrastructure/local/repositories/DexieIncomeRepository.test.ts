import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Income } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieIncomeRepository } from './DexieIncomeRepository'

let database: GastoClaroDB | undefined
const income = (id: string, date: string, ownerId = 'owner'): Income => ({
  id,
  ownerId,
  periodId: 'period',
  amount: 100,
  description: '',
  date,
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
describe('DexieIncomeRepository', () => {
  it('filtra por propietario y ordena por fecha descendente', async () => {
    database = new GastoClaroDB('incomes-test')
    const repository = new DexieIncomeRepository(database, 'owner')
    await repository.create(income('old', '2026-01-01'))
    await repository.create(income('new', '2026-01-02'))
    await database.incomes.add(income('other', '2026-01-03', 'other'))
    expect(
      (await repository.findByPeriod('period')).map((value) => value.id),
    ).toEqual(['new', 'old'])
  })
  it('realiza soft delete', async () => {
    database = new GastoClaroDB('incomes-delete-test')
    const repository = new DexieIncomeRepository(database, 'owner')
    await repository.create(income('income', '2026-01-01'))
    await repository.delete('income')
    expect(await repository.findById('income')).toBeNull()
  })
  it('findAll devuelve solo registros activos del owner sin normalizarlos', async () => {
    database = new GastoClaroDB('incomes-find-all-test')
    const repository = new DexieIncomeRepository(database, 'owner')
    const active = income('active', '2026-01-02')
    await database.incomes.bulkAdd([
      active,
      {
        ...income('deleted', '2026-01-03'),
        deletedAt: '2026-01-04T00:00:00.000Z',
      },
      income('other-owner', '2026-01-04', 'other'),
    ])

    const result = await repository.findAll()

    expect(result).toEqual([active])
    expect(result[0]).not.toHaveProperty('status')
    expect(result[0]).not.toHaveProperty('affectsBalance')
    expect(result[0]).not.toHaveProperty('balanceEffectiveAt')
  })
})
