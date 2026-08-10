import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  Category,
  CategoryBudget,
  Expense,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import {
  CategoryDuplicateError,
  OccurrenceAlreadyPaidError,
  PeriodOverlapError,
} from '@domain/errors'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexiePeriodRepository,
  DexieRecurringPaymentOccurrenceRepository,
  DexieRecurringPaymentRepository,
} from '@infrastructure/local/repositories'
import { DexieCategoryDeletionTransaction } from '@infrastructure/local/transactions/DexieCategoryDeletionTransaction'
import { DexieRecurringPaymentTransaction } from '@infrastructure/local/transactions/DexieRecurringPaymentTransaction'
import { CreateCategory } from './categories/CreateCategory'
import { DeleteCategory } from './categories/DeleteCategory'
import { CreatePeriod } from './periods/CreatePeriod'
import { GenerateOccurrencesForPeriod } from './recurring-payments/GenerateOccurrencesForPeriod'
import { MarkOccurrenceAsPaid } from './recurring-payments/MarkOccurrenceAsPaid'

const ownerId = '10000000-0000-4000-8000-000000000001'
const now = '2026-01-01T00:00:00.000Z'
const clock = { now: () => now }
const base = {
  ownerId,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  syncStatus: 'synced' as const,
}

let databaseSequence = 0
let idSequence = 0
let database: GastoClaroDB

const ids = {
  generate: () =>
    `00000000-0000-4000-8000-${String(++idSequence).padStart(12, '0')}`,
}

const category = (id: string, name: string, isSystem = false): Category => ({
  ...base,
  id,
  name,
  normalizedName: name.trim().toLowerCase(),
  color: '#123ABC',
  icon: null,
  isSystem,
})

beforeEach(() => {
  idSequence = 0
  database = new GastoClaroDB(`critical-use-cases-${databaseSequence++}`)
})

afterEach(async () => {
  const name = database.name
  database.close()
  await Dexie.delete(name)
})

describe('integracion de casos de uso criticos', () => {
  it('rechaza un periodo que se solapa con otro existente', async () => {
    const periods = new DexiePeriodRepository(database, ownerId)
    const createPeriod = new CreatePeriod(periods, ids, clock)

    await createPeriod.execute({
      ownerId,
      type: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })

    await expect(
      createPeriod.execute({
        ownerId,
        type: 'biweekly',
        startDate: '2026-01-31',
        endDate: '2026-02-14',
      }),
    ).rejects.toBeInstanceOf(PeriodOverlapError)
    expect(await periods.findAll()).toHaveLength(1)
  })

  it('rechaza una categoria duplicada aunque cambien espacios y mayusculas', async () => {
    const categories = new DexieCategoryRepository(database, ownerId)
    const createCategory = new CreateCategory(categories, ids, clock)

    await createCategory.execute({
      ownerId,
      name: '  Comida  ',
      color: '#123ABC',
    })

    await expect(
      createCategory.execute({ ownerId, name: ' cOmIdA ', color: '#ABC123' }),
    ).rejects.toBeInstanceOf(CategoryDuplicateError)
    expect(await categories.findAll()).toHaveLength(1)
  })

  it('paga una ocurrencia atomicamente y rechaza un segundo intento', async () => {
    const payment: RecurringPayment = {
      ...base,
      id: 'payment',
      name: 'Renta',
      amount: 850_000,
      frequency: 'monthly',
      dueDate: '2026-01-05',
      endDate: null,
      categoryId: 'housing',
      status: 'active',
    }
    const occurrence: RecurringPaymentOccurrence = {
      ...base,
      id: 'occurrence',
      recurringPaymentId: payment.id,
      periodId: 'period',
      dueDate: '2026-01-05',
      status: 'pending',
      transactionId: null,
    }
    await database.periods.add({
      ...base,
      id: 'period',
      type: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
    await database.recurringPayments.add(payment)
    await database.recurringPaymentOccurrences.add(occurrence)
    const markAsPaid = new MarkOccurrenceAsPaid(
      new DexieRecurringPaymentTransaction(database, ids, clock),
    )

    await expect(
      markAsPaid.execute({
        ownerId,
        occurrenceId: occurrence.id,
        paidDate: '2026-02-01',
      }),
    ).rejects.toThrow('La fecha de pago debe estar dentro del periodo activo.')
    expect(await database.expenses.count()).toBe(0)

    const result = await markAsPaid.execute({
      ownerId,
      occurrenceId: occurrence.id,
      paidDate: '2026-01-05',
    })

    expect(result.expense).toMatchObject({
      amount: payment.amount,
      categoryId: payment.categoryId,
      recurringOccurrenceId: occurrence.id,
    })
    expect(result.occurrence).toMatchObject({
      status: 'paid',
      transactionId: result.expense.id,
    })
    expect(await database.expenses.toArray()).toEqual([result.expense])
    expect(
      await database.recurringPaymentOccurrences.get(occurrence.id),
    ).toEqual(result.occurrence)
    expect(await database.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        entityId: occurrence.id,
        operationType: 'pay_recurring_occurrence',
        status: 'pending',
      }),
    ])

    await expect(
      markAsPaid.execute({
        ownerId,
        occurrenceId: occurrence.id,
        paidDate: '2026-01-05',
      }),
    ).rejects.toBeInstanceOf(OccurrenceAlreadyPaidError)
    expect(await database.expenses.count()).toBe(1)
    expect(await database.syncOperations.count()).toBe(1)
  })

  it('elimina una categoria y reasigna sus gastos a Sin categoría', async () => {
    const categories = new DexieCategoryRepository(database, ownerId)
    const expenses = new DexieExpenseRepository(database, ownerId)
    const uncategorized = category('uncategorized', 'Sin categoría', true)
    const food = category('food', 'Comida')
    const expense: Expense = {
      ...base,
      id: 'expense',
      periodId: 'period',
      categoryId: food.id,
      amount: 25_000,
      description: 'Supermercado',
      date: '2026-01-10',
      recurringOccurrenceId: null,
    }
    const budget: CategoryBudget = {
      ...base,
      id: 'budget',
      periodId: 'period',
      categoryId: food.id,
      amount: 50_000,
    }
    await categories.create(uncategorized)
    await categories.create(food)
    await expenses.create(expense)
    await database.categoryBudgets.add(budget)
    const deleteCategory = new DeleteCategory(
      categories,
      new DexieCategoryDeletionTransaction(database, ownerId),
    )

    await deleteCategory.execute(food.id)

    expect(await categories.findById(food.id)).toBeNull()
    expect(await categories.findSystemCategory()).toEqual(uncategorized)
    expect(await expenses.findById(expense.id)).toMatchObject({
      categoryId: uncategorized.id,
      syncStatus: 'pending',
    })
    expect(await database.categoryBudgets.get(budget.id)).toMatchObject({
      deletedAt: expect.any(String),
      syncStatus: 'pending',
    })
  })

  it('no duplica ocurrencias existentes al regenerar un periodo', async () => {
    const periods = new DexiePeriodRepository(database, ownerId)
    const payments = new DexieRecurringPaymentRepository(database, ownerId)
    const occurrences = new DexieRecurringPaymentOccurrenceRepository(
      database,
      ownerId,
    )
    await periods.create({
      ...base,
      id: 'period',
      type: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
    await payments.create({
      ...base,
      id: 'payment',
      name: 'Servicio semanal',
      amount: 10_000,
      frequency: 'weekly',
      dueDate: '2026-01-03',
      endDate: '2026-01-17',
      categoryId: 'services',
      status: 'active',
    })
    const generateOccurrences = new GenerateOccurrencesForPeriod(
      periods,
      payments,
      occurrences,
      ids,
      clock,
    )

    const first = await generateOccurrences.execute(ownerId, 'period')
    const second = await generateOccurrences.execute(ownerId, 'period')
    const persisted = await occurrences.findByPaymentAndPeriod(
      'payment',
      'period',
    )

    expect(first.created).toHaveLength(3)
    expect(first.created.map((value) => value.dueDate)).toEqual([
      '2026-01-03',
      '2026-01-10',
      '2026-01-17',
    ])
    expect(second.created).toEqual([])
    expect(second.skippedExisting).toBe(first.created.length)
    expect(persisted).toHaveLength(first.created.length)
    expect(new Set(persisted.map((value) => value.dueDate)).size).toBe(
      persisted.length,
    )
  })
})
