import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { GastoClaroDB } from '../database'
import { DeleteExpense } from '@application/use-cases/expenses/DeleteExpense'
import { DexieExpenseRepository } from '../repositories/DexieExpenseRepository'
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
      amount: 100,
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
      amount: 100,
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

  it('usa el snapshot de occurrence por defecto y acepta un monto real distinto', async () => {
    database = new GastoClaroDB('payment-actual-amount')
    await database.periods.add(period)
    await database.recurringPayments.add({
      ...base,
      id: 'payment',
      name: 'Rent',
      amount: 999,
      frequency: 'monthly',
      dueDate: '2026-01-01',
      endDate: null,
      categoryId: 'category',
      status: 'active',
    })
    await database.recurringPaymentOccurrences.bulkAdd([
      {
        ...base,
        id: 'snapshot-default',
        recurringPaymentId: 'payment',
        periodId: 'period',
        dueDate: '2026-01-01',
        status: 'pending',
        amount: 125,
        transactionId: null,
      },
      {
        ...base,
        id: 'actual-override',
        recurringPaymentId: 'payment',
        periodId: 'period',
        dueDate: '2026-01-02',
        status: 'pending',
        amount: 200,
        transactionId: null,
      },
    ])
    let count = 0
    const transaction = new DexieRecurringPaymentTransaction(
      database,
      {
        generate: () =>
          `10000000-0000-4000-8000-${String(++count).padStart(12, '0')}`,
      },
      { now: () => '2026-01-02T00:00:00.000Z' },
    )

    const defaultResult = await transaction.markOccurrenceAsPaid({
      ownerId,
      occurrenceId: 'snapshot-default',
      paidDate: '2026-01-02',
    })
    const actualResult = await transaction.markOccurrenceAsPaid({
      ownerId,
      occurrenceId: 'actual-override',
      paidDate: '2026-01-02',
      actualAmountCents: 240,
    })

    expect(defaultResult.expense).toMatchObject({
      amount: 125,
      affectsBalance: true,
      balanceEffectiveAt: '2026-01-02T00:00:00.000Z',
    })
    expect(actualResult.expense.amount).toBe(240)
  })

  it('soft-deletea el gasto vinculado y revierte paid a pending atómicamente', async () => {
    database = new GastoClaroDB('payment-linked-delete')
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
      amount: 100,
      transactionId: null,
    })
    let count = 0
    const transaction = new DexieRecurringPaymentTransaction(
      database,
      {
        generate: () =>
          `20000000-0000-4000-8000-${String(++count).padStart(12, '0')}`,
      },
      { now: () => '2026-01-02T00:00:00.000Z' },
    )
    const paid = await transaction.markOccurrenceAsPaid({
      ownerId,
      occurrenceId: 'occurrence',
      paidDate: '2026-01-02',
    })

    await new DeleteExpense(
      new DexieExpenseRepository(database, ownerId),
      transaction,
    ).execute(paid.expense.id)

    expect(await database.expenses.get(paid.expense.id)).toMatchObject({
      deletedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(
      await database.recurringPaymentOccurrences.get('occurrence'),
    ).toMatchObject({ status: 'pending', transactionId: null })
    expect(await database.syncOperations.count()).toBe(3)
  })

  it('revierte el tombstone si falla entre gasto y occurrence', async () => {
    database = new GastoClaroDB('payment-linked-delete-rollback')
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
      amount: 100,
      transactionId: null,
    })
    let count = 0
    const generatedIds = {
      generate: () =>
        `30000000-0000-4000-8000-${String(++count).padStart(12, '0')}`,
    }
    const paid = await new DexieRecurringPaymentTransaction(
      database,
      generatedIds,
      { now: () => '2026-01-02T00:00:00.000Z' },
    ).markOccurrenceAsPaid({
      ownerId,
      occurrenceId: 'occurrence',
      paidDate: '2026-01-02',
    })
    const queueBefore = await database.syncOperations.toArray()
    const failing = new DexieRecurringPaymentTransaction(
      database,
      generatedIds,
      { now: () => '2026-01-03T00:00:00.000Z' },
      (step) => {
        if (step === 'delete:expense-soft-deleted')
          throw new Error('fallo de reversión')
      },
    )

    await expect(
      failing.deleteLinkedExpense(ownerId, paid.expense.id),
    ).rejects.toThrow('fallo de reversión')
    expect(await database.expenses.get(paid.expense.id)).toEqual(paid.expense)
    expect(
      await database.recurringPaymentOccurrences.get('occurrence'),
    ).toEqual(paid.occurrence)
    expect(await database.syncOperations.toArray()).toEqual(queueBefore)
  })
})
