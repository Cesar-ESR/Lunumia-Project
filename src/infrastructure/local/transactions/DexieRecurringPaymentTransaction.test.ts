import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { GastoClaroDB } from '../database'
import { DexieRecurringPaymentTransaction } from './DexieRecurringPaymentTransaction'

let database: GastoClaroDB | undefined
const ownerId = '10000000-0000-4000-8000-000000000001'
const base = {
  ownerId,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced' as const,
}
const period = {
  ...base,
  id: 'period',
  type: 'monthly' as const,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
}

afterEach(async () => {
  if (database) {
    database.close()
    await Dexie.delete(database.name)
    database = undefined
  }
})

describe('DexieRecurringPaymentTransaction', () => {
  it('crea un gasto, paga la ocurrencia y encola una operación una sola vez', async () => {
    database = new GastoClaroDB('payment-transaction')
    await database.periods.add(period)
    await database.recurringPayments.add({
      ...base,
      id: 'payment',
      name: 'Rent',
      amount: 100,
      frequency: 'monthly',
      dueDate: '2026-01-01',
      endDate: null,
      categoryId: 'category',
      status: 'active',
    })
    await database.recurringPaymentOccurrences.add({
      ...base,
      id: 'occurrence',
      recurringPaymentId: 'payment',
      periodId: 'period',
      dueDate: '2026-01-01',
      status: 'pending',
      transactionId: null,
    })
    let count = 0
    const transaction = new DexieRecurringPaymentTransaction(
      database,
      {
        generate: () =>
          `00000000-0000-4000-8000-${String(++count).padStart(12, '0')}`,
      },
      { now: () => '2026-01-02T00:00:00.000Z' },
    )

    const result = await transaction.markOccurrenceAsPaid({
      ownerId,
      occurrenceId: 'occurrence',
      paidDate: '2026-01-02',
    })

    expect(result.occurrence.status).toBe('paid')
    expect(await database.expenses.count()).toBe(1)
    expect(await database.syncOperations.count()).toBe(1)
    const operation = await database.syncOperations.toCollection().first()
    expect(operation).toMatchObject({
      entityType: 'recurringPaymentOccurrence',
      entityId: 'occurrence',
      operationType: 'pay_recurring_occurrence',
    })
    expect(JSON.parse(operation?.payload ?? '{}')).toMatchObject({
      occurrence: { id: 'occurrence', status: 'paid' },
      expense: { id: result.expense.id, recurringOccurrenceId: 'occurrence' },
    })
    await expect(
      transaction.markOccurrenceAsPaid({
        ownerId,
        occurrenceId: 'occurrence',
        paidDate: '2026-01-02',
      }),
    ).rejects.toThrow()
    expect(await database.expenses.count()).toBe(1)
    expect(await database.syncOperations.count()).toBe(1)
  })

  it('revierte todas las escrituras si falla el encolado', async () => {
    database = new GastoClaroDB('payment-rollback')
    await database.periods.add(period)
    await database.recurringPayments.add({
      ...base,
      id: 'payment',
      name: 'Rent',
      amount: 100,
      frequency: 'monthly',
      dueDate: '2026-01-01',
      endDate: null,
      categoryId: 'category',
      status: 'active',
    })
    await database.recurringPaymentOccurrences.add({
      ...base,
      id: 'occurrence',
      recurringPaymentId: 'payment',
      periodId: 'period',
      dueDate: '2026-01-01',
      status: 'pending',
      transactionId: null,
    })
    let count = 0
    const transaction = new DexieRecurringPaymentTransaction(
      database,
      {
        generate: () => {
          count++
          if (count === 2) throw new Error('sync failure')
          return 'expense'
        },
      },
      { now: () => '2026-01-02T00:00:00.000Z' },
    )

    await expect(
      transaction.markOccurrenceAsPaid({
        ownerId,
        occurrenceId: 'occurrence',
        paidDate: '2026-01-02',
      }),
    ).rejects.toThrow('sync failure')

    expect(await database.expenses.count()).toBe(0)
    expect(await database.syncOperations.count()).toBe(0)
    expect(
      (await database.recurringPaymentOccurrences.get('occurrence'))?.status,
    ).toBe('pending')
  })
})
