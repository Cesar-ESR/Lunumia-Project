import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieRecurringPaymentOccurrenceRepository } from './DexieRecurringPaymentOccurrenceRepository'
import { DexieRecurringPaymentRepository } from './DexieRecurringPaymentRepository'

let database: GastoClaroDB | undefined
const base = {
  ownerId: 'owner',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced' as const,
}
const payment = (
  id: string,
  status: RecurringPayment['status'] = 'active',
): RecurringPayment => ({
  ...base,
  id,
  name: 'Rent',
  amount: 100,
  frequency: 'monthly',
  dueDate: '2026-01-01',
  endDate: null,
  categoryId: 'category',
  status,
})
const occurrence = (id: string): RecurringPaymentOccurrence => ({
  ...base,
  id,
  recurringPaymentId: 'payment',
  periodId: 'period',
  dueDate: '2026-01-15',
  status: 'pending',
  transactionId: null,
})
afterEach(async () => {
  if (database) {
    database.close()
    await Dexie.delete(database.name)
    database = undefined
  }
})
describe('repositorios recurrentes', () => {
  it('recupera solamente pagos activos', async () => {
    database = new GastoClaroDB('payments-test')
    const repository = new DexieRecurringPaymentRepository(database, 'owner')
    await repository.create(payment('active'))
    await repository.create(payment('inactive', 'inactive'))
    expect((await repository.findActive()).map((value) => value.id)).toEqual([
      'active',
    ])
  })
  it('no duplica ocurrencias del mismo pago y fecha', async () => {
    database = new GastoClaroDB('occurrences-test')
    const repository = new DexieRecurringPaymentOccurrenceRepository(
      database,
      'owner',
    )
    const created = await repository.create(occurrence('first'))
    expect(await repository.findById(created.id)).toEqual(created)
    const duplicate = await repository.create(occurrence('second'))
    expect(duplicate.id).toBe('first')
    expect((await repository.findByPeriod('period')).length).toBe(1)
  })
  it('findAll devuelve solo ocurrencias activas del owner sin normalizarlas', async () => {
    database = new GastoClaroDB('occurrences-find-all-test')
    const repository = new DexieRecurringPaymentOccurrenceRepository(
      database,
      'owner',
    )
    const active = occurrence('active')
    await database.recurringPaymentOccurrences.bulkAdd([
      active,
      {
        ...occurrence('deleted'),
        deletedAt: '2026-01-04T00:00:00.000Z',
      },
      { ...occurrence('other-owner'), ownerId: 'other' },
    ])

    const result = await repository.findAll()

    expect(result).toEqual([active])
    expect(result[0]).not.toHaveProperty('amount')
  })
})
