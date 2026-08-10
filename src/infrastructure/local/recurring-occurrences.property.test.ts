import Dexie from 'dexie'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MarkOccurrenceAsPaid } from '@application/use-cases/recurring-payments/MarkOccurrenceAsPaid'
import { MarkOccurrenceAsSkipped } from '@application/use-cases/recurring-payments/MarkOccurrenceAsSkipped'
import type {
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import { OccurrenceAlreadyPaidError } from '@domain/errors'
import { GastoClaroDB } from './database'
import { DexieRecurringPaymentOccurrenceRepository } from './repositories'
import { DexieRecurringPaymentTransaction } from './transactions/DexieRecurringPaymentTransaction'

const RUNS = 100
const now = '2026-01-01T00:00:00.000Z'
const dateOnlyArbitrary = fc.integer({ min: 0, max: 3_650 }).map((offset) => {
  const date = new Date(Date.UTC(2020, 0, 1 + offset))
  return date.toISOString().slice(0, 10)
})
const nameArbitrary = fc.stringMatching(/^[A-Za-z0-9]{1,80}$/)

const pendingOccurrenceArbitrary = fc.record({
  ownerId: fc.uuid(),
  periodId: fc.uuid(),
  categoryId: fc.uuid(),
  paymentId: fc.uuid(),
  occurrenceId: fc.uuid(),
  expenseId: fc.uuid(),
  operationId: fc.uuid(),
  paymentName: nameArbitrary,
  amount: fc.integer({ min: 1, max: 1_000_000_000 }),
  frequency: fc.constantFrom<RecurringPayment['frequency']>(
    'weekly',
    'biweekly',
    'monthly',
  ),
  paymentStatus: fc.constantFrom<RecurringPayment['status']>(
    'active',
    'inactive',
  ),
  dueDate: dateOnlyArbitrary,
  paidDate: dateOnlyArbitrary,
})

let databaseSequence = 0
let database: GastoClaroDB

beforeEach(() => {
  database = new GastoClaroDB(
    `recurring-occurrence-properties-${databaseSequence++}`,
  )
})

afterEach(async () => {
  const name = database.name
  database.close()
  await Dexie.delete(name)
})

describe('propiedades de pago de ocurrencias recurrentes', () => {
  it('P11: pagar una ocurrencia crea exactamente un gasto y el reintento es rechazado', async () => {
    await fc.assert(
      fc.asyncProperty(pendingOccurrenceArbitrary, async (value) => {
        await database.periods.clear()
        await database.recurringPayments.clear()
        await database.recurringPaymentOccurrences.clear()
        await database.expenses.clear()
        await database.syncOperations.clear()

        const base = {
          ownerId: value.ownerId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'synced' as const,
        }
        const payment: RecurringPayment = {
          ...base,
          id: value.paymentId,
          name: value.paymentName,
          amount: value.amount,
          frequency: value.frequency,
          dueDate: value.dueDate,
          endDate: null,
          categoryId: value.categoryId,
          status: value.paymentStatus,
        }
        const occurrence: RecurringPaymentOccurrence = {
          ...base,
          id: value.occurrenceId,
          recurringPaymentId: payment.id,
          periodId: value.periodId,
          dueDate: value.dueDate,
          status: 'pending',
          transactionId: null,
        }
        await database.periods.add({
          ...base,
          id: value.periodId,
          type: 'monthly',
          startDate:
            value.dueDate < value.paidDate ? value.dueDate : value.paidDate,
          endDate:
            value.dueDate > value.paidDate ? value.dueDate : value.paidDate,
        })
        await database.recurringPayments.add(payment)
        await database.recurringPaymentOccurrences.add(occurrence)
        let generatedIds = 0
        const markAsPaid = new MarkOccurrenceAsPaid(
          new DexieRecurringPaymentTransaction(
            database,
            {
              generate: () =>
                generatedIds++ === 0 ? value.expenseId : value.operationId,
            },
            { now: () => now },
          ),
        )
        const input = {
          ownerId: value.ownerId,
          occurrenceId: occurrence.id,
          paidDate: value.paidDate,
        }

        const result = await markAsPaid.execute(input)
        const linkedExpenses = await database.expenses
          .where('recurringOccurrenceId')
          .equals(occurrence.id)
          .toArray()

        expect(linkedExpenses).toEqual([result.expense])
        expect(result.expense).toMatchObject({
          id: value.expenseId,
          ownerId: value.ownerId,
          periodId: value.periodId,
          categoryId: value.categoryId,
          amount: value.amount,
          recurringOccurrenceId: occurrence.id,
        })
        expect(
          await database.recurringPaymentOccurrences.get(occurrence.id),
        ).toMatchObject({
          status: 'paid',
          transactionId: result.expense.id,
        })

        await expect(markAsPaid.execute(input)).rejects.toBeInstanceOf(
          OccurrenceAlreadyPaidError,
        )
        expect(
          await database.expenses
            .where('recurringOccurrenceId')
            .equals(occurrence.id)
            .count(),
        ).toBe(1)
        expect(await database.syncOperations.count()).toBe(1)
      }),
      { numRuns: RUNS },
    )
  })

  it('P13: omitir una ocurrencia no crea ningun gasto vinculado', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          ownerId: fc.uuid(),
          periodId: fc.uuid(),
          occurrenceId: fc.uuid(),
          paymentId: fc.uuid(),
          dueDate: dateOnlyArbitrary,
        }),
        async (value) => {
          await database.recurringPaymentOccurrences.clear()
          await database.expenses.clear()
          const occurrence: RecurringPaymentOccurrence = {
            id: value.occurrenceId,
            ownerId: value.ownerId,
            recurringPaymentId: value.paymentId,
            periodId: value.periodId,
            dueDate: value.dueDate,
            status: 'pending',
            transactionId: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            syncStatus: 'synced',
          }
          const occurrences = new DexieRecurringPaymentOccurrenceRepository(
            database,
            value.ownerId,
          )
          await occurrences.create(occurrence)
          const markAsSkipped = new MarkOccurrenceAsSkipped(occurrences, {
            now: () => now,
          })

          const skipped = await markAsSkipped.execute(
            value.periodId,
            occurrence.id,
          )

          expect(skipped.status).toBe('skipped')
          expect(skipped.transactionId).toBeNull()
          expect(await occurrences.findById(occurrence.id)).toEqual(skipped)
          expect(
            await database.expenses
              .where('recurringOccurrenceId')
              .equals(occurrence.id)
              .count(),
          ).toBe(0)
        },
      ),
      { numRuns: RUNS },
    )
  })
})
