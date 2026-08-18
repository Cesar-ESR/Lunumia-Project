import Dexie from 'dexie'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GastoClaroDB } from '../database'
import { DexieRecurringPaymentTransaction } from './DexieRecurringPaymentTransaction'
import { positiveAmountCentsArbitrary } from '@infrastructure/sync/property/arbitraries'
import { CompoundPaymentRemoteModel } from '@infrastructure/sync/property/models'
import type { SyncOperation } from '@domain/entities'
import { calculateFinancialSnapshot } from '@domain/calculations'
import {
  makeAnchor,
  makePeriod,
  PROPERTY_RUNS,
  signedCentsArbitrary,
  TODAY,
} from '@domain/calculations/financial-invariants.arbitraries'

const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000002'
const paymentId = '30000000-0000-4000-8000-000000000003'
const occurrenceId = '40000000-0000-4000-8000-000000000004'
const createdAt = '2026-08-01T00:00:00.000Z'
const paidAt = '2026-08-15T12:00:00.000Z'

let database: GastoClaroDB
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  database = new GastoClaroDB(`recurring-property-${databaseSequence}`)
})

afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

async function resetFixture(amount: number): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()))
    const base = {
      ownerId,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      syncStatus: 'synced' as const,
    }
    await database.periods.add({
      ...base,
      id: periodId,
      type: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    await database.recurringPayments.add({
      ...base,
      id: paymentId,
      name: 'Pago generado',
      amount,
      frequency: 'monthly',
      dueDate: '2026-08-15',
      endDate: null,
      categoryId: '50000000-0000-4000-8000-000000000005',
      status: 'active',
    })
    await database.recurringPaymentOccurrences.add({
      ...base,
      id: occurrenceId,
      recurringPaymentId: paymentId,
      periodId,
      dueDate: '2026-08-15',
      status: 'pending',
      amount,
      transactionId: null,
    })
  })
}

function ids(failOperation = false): { generate(): string } {
  let sequence = 0
  return {
    generate: () => {
      sequence += 1
      if (failOperation && sequence === 2)
        throw new Error('generated queue failure')
      return `90000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
    },
  }
}

async function financialSnapshot(anchorAmount: number) {
  const [expenses, occurrences] = await Promise.all([
    database.expenses.toArray(),
    database.recurringPaymentOccurrences.toArray(),
  ])
  return calculateFinancialSnapshot({
    today: TODAY,
    currentPeriod: makePeriod(),
    anchor: makeAnchor(anchorAmount),
    incomes: [],
    expenses,
    occurrences,
  })
}

async function activeLinkedExpenses() {
  return database.expenses
    .where('recurringOccurrenceId')
    .equals(occurrenceId)
    .filter((expense) => expense.deletedAt === null)
    .toArray()
}

const changedPaymentAmountArbitrary = fc.oneof(
  fc
    .record({
      planned: positiveAmountCentsArbitrary,
      delta: positiveAmountCentsArbitrary,
    })
    .map(({ planned, delta }) => ({
      planned,
      actual: planned + delta,
      delta,
    })),
  fc.integer({ min: 2, max: 100_000_000 }).chain((planned) =>
    fc.integer({ min: 1, max: planned - 1 }).map((actual) => ({
      planned,
      actual,
      delta: actual - planned,
    })),
  ),
)

describe('propiedades del pago compuesto recurrente', () => {
  it('P1: pagar exactamente el snapshot conserva projected available', async () => {
    await fc.assert(
      fc.asyncProperty(
        positiveAmountCentsArbitrary,
        signedCentsArbitrary,
        async (amount, anchorAmount) => {
          await resetFixture(amount)
          const before = await financialSnapshot(anchorAmount)
          await new DexieRecurringPaymentTransaction(database, ids(), {
            now: () => paidAt,
          }).markOccurrenceAsPaid({
            ownerId,
            occurrenceId,
            paidDate: TODAY,
            actualAmountCents: amount,
          })
          const after = await financialSnapshot(anchorAmount)

          expect(after.projectedAvailableCents).toBe(
            before.projectedAvailableCents,
          )
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P2: pagar un monto diferente cambia projected available sólo por delta', async () => {
    await fc.assert(
      fc.asyncProperty(
        changedPaymentAmountArbitrary,
        signedCentsArbitrary,
        async ({ planned, actual, delta }, anchorAmount) => {
          await resetFixture(planned)
          const before = await financialSnapshot(anchorAmount)
          await new DexieRecurringPaymentTransaction(database, ids(), {
            now: () => paidAt,
          }).markOccurrenceAsPaid({
            ownerId,
            occurrenceId,
            paidDate: TODAY,
            actualAmountCents: actual,
          })
          const after = await financialSnapshot(anchorAmount)

          expect(after.projectedAvailableCents).toBe(
            (before.projectedAvailableCents ?? 0) - delta,
          )
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P12: paid has exactly one active expense, retry cannot duplicate it, and reversal restores pending', async () => {
    await fc.assert(
      fc.asyncProperty(positiveAmountCentsArbitrary, async (amount) => {
        await resetFixture(amount)
        const transaction = new DexieRecurringPaymentTransaction(
          database,
          ids(),
          { now: () => paidAt },
        )
        const paid = await transaction.markOccurrenceAsPaid({
          ownerId,
          occurrenceId,
          paidDate: TODAY,
        })

        expect(
          await database.recurringPaymentOccurrences.get(occurrenceId),
        ).toMatchObject({ status: 'paid' })
        expect(await activeLinkedExpenses()).toHaveLength(1)
        await expect(
          transaction.markOccurrenceAsPaid({
            ownerId,
            occurrenceId,
            paidDate: TODAY,
          }),
        ).rejects.toThrow()
        expect(await activeLinkedExpenses()).toHaveLength(1)

        await transaction.deleteLinkedExpense(ownerId, paid.expense.id)

        expect(
          await database.recurringPaymentOccurrences.get(occurrenceId),
        ).toMatchObject({ status: 'pending', transactionId: null })
        expect(await activeLinkedExpenses()).toHaveLength(0)
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('PBT: crea gasto + paga ocurrencia + encola exactamente una operación compuesta', async () => {
    await fc.assert(
      fc.asyncProperty(positiveAmountCentsArbitrary, async (amount) => {
        await resetFixture(amount)
        const transaction = new DexieRecurringPaymentTransaction(
          database,
          ids(),
          { now: () => paidAt },
        )
        const paid = await transaction.markOccurrenceAsPaid({
          ownerId,
          occurrenceId,
          paidDate: '2026-08-15',
        })

        expect(paid.expense.amount).toBe(amount)
        expect(paid.occurrence.transactionId).toBe(paid.expense.id)
        expect(await database.expenses.count()).toBe(1)
        const operations = await database.syncOperations.toArray()
        expect(operations).toHaveLength(1)
        expect(operations[0]).toMatchObject({
          entityType: 'recurringPaymentOccurrence',
          entityId: occurrenceId,
          operationType: 'pay_recurring_occurrence',
        })
        const payload: unknown = JSON.parse(operations[0]?.payload ?? '{}')
        expect(payload).toMatchObject({
          occurrence: { id: occurrenceId, status: 'paid' },
          expense: { id: paid.expense.id, recurringOccurrenceId: occurrenceId },
        })
        await expect(
          transaction.markOccurrenceAsPaid({
            ownerId,
            occurrenceId,
            paidDate: '2026-08-15',
          }),
        ).rejects.toThrow()
        expect(await database.expenses.count()).toBe(1)
        expect(await database.syncOperations.count()).toBe(1)
      }),
      { numRuns: 100 },
    )
  })

  it('PBT: cualquier fallo al encolar revierte gasto, ocurrencia y operación', async () => {
    await fc.assert(
      fc.asyncProperty(positiveAmountCentsArbitrary, async (amount) => {
        await resetFixture(amount)
        const transaction = new DexieRecurringPaymentTransaction(
          database,
          ids(true),
          { now: () => paidAt },
        )
        await expect(
          transaction.markOccurrenceAsPaid({
            ownerId,
            occurrenceId,
            paidDate: '2026-08-15',
          }),
        ).rejects.toThrow('generated queue failure')

        expect(await database.expenses.count()).toBe(0)
        expect(await database.syncOperations.count()).toBe(0)
        expect(
          await database.recurringPaymentOccurrences.get(occurrenceId),
        ).toMatchObject({
          status: 'pending',
          transactionId: null,
        })
      }),
      { numRuns: 100 },
    )
  })

  it('PBT: la RPC compuesta falsa es idempotente por operationId y atómica', async () => {
    await fc.assert(
      fc.asyncProperty(
        positiveAmountCentsArbitrary,
        fc.integer({ min: 2, max: 20 }),
        fc.uuid(),
        fc.uuid(),
        async (amount, repetitions, otherOperationId, otherOwnerId) => {
          fc.pre(otherOperationId !== '90000000-0000-4000-8000-000000000002')
          fc.pre(otherOwnerId !== ownerId)
          await resetFixture(amount)
          const pendingOccurrence =
            await database.recurringPaymentOccurrences.get(occurrenceId)
          if (!pendingOccurrence)
            throw new Error('Falta la ocurrencia inicial.')

          const paid = await new DexieRecurringPaymentTransaction(
            database,
            ids(),
            { now: () => paidAt },
          ).markOccurrenceAsPaid({
            ownerId,
            occurrenceId,
            paidDate: '2026-08-15',
          })
          const operation = await database.syncOperations.toCollection().first()
          if (!operation) throw new Error('Falta la operación compuesta.')

          const remote = new CompoundPaymentRemoteModel()
          remote.seedOccurrence(pendingOccurrence)
          const responses = Array.from({ length: repetitions }, () =>
            remote.apply(ownerId, operation, paid),
          )
          expect(responses[0]).toBe('applied')
          expect(responses.slice(1)).toEqual(
            Array.from({ length: repetitions - 1 }, () => 'already_processed'),
          )
          expect(remote.processedCount).toBe(1)
          expect(remote.expenseCount).toBe(1)
          expect(remote.getExpense(paid.expense.id)).toMatchObject({
            recurringOccurrenceId: occurrenceId,
          })
          expect(remote.getOccurrence(occurrenceId)).toMatchObject({
            status: 'paid',
            transactionId: paid.expense.id,
          })

          const distinctOperation: SyncOperation = {
            ...operation,
            operationId: otherOperationId,
          }
          expect(remote.apply(ownerId, distinctOperation, paid)).toBe(
            'remote_wins',
          )
          expect(remote.expenseCount).toBe(1)
          expect(remote.processedCount).toBe(2)

          expect(() =>
            remote.apply(otherOwnerId, operation, {
              occurrence: { ...paid.occurrence, ownerId: otherOwnerId },
              expense: { ...paid.expense, ownerId: otherOwnerId },
            }),
          ).toThrow('operation_id_belongs_to_another_user')

          const failingRemote = new CompoundPaymentRemoteModel()
          failingRemote.seedOccurrence(pendingOccurrence)
          expect(() =>
            failingRemote.apply(ownerId, operation, paid, true),
          ).toThrow('injected_remote_failure')
          expect(failingRemote.processedCount).toBe(0)
          expect(failingRemote.expenseCount).toBe(0)
          expect(failingRemote.getOccurrence(occurrenceId)).toEqual(
            pendingOccurrence,
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
