import type {
  MarkOccurrenceAsPaidInput,
  MarkOccurrenceAsPaidResult,
  RecurringPaymentTransaction,
} from '@application/services/RecurringPaymentTransaction'
import { OccurrenceAlreadyPaidError } from '@domain/errors'
import { GastoClaroDB } from '../database'
import {
  createSyncOperation,
  isAuthenticatedOwnerId,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieRecurringPaymentTransaction implements RecurringPaymentTransaction {
  private readonly sync: SyncMutationDependencies

  constructor(
    private readonly db: GastoClaroDB,
    ids?: { generate(): string },
    clock?: { now(): string },
    private readonly onStep: (step: string) => void = () => undefined,
  ) {
    this.sync = resolveSyncDependencies({ ids, clock })
  }

  async markOccurrenceAsPaid(
    input: MarkOccurrenceAsPaidInput,
  ): Promise<MarkOccurrenceAsPaidResult> {
    return this.db.transaction(
      'rw',
      this.db.periods,
      this.db.recurringPaymentOccurrences,
      this.db.recurringPayments,
      this.db.expenses,
      this.db.syncOperations,
      async () => {
        const occurrence = await this.db.recurringPaymentOccurrences.get(
          input.occurrenceId,
        )
        if (
          !occurrence ||
          occurrence.ownerId !== input.ownerId ||
          occurrence.deletedAt !== null ||
          occurrence.status !== 'pending'
        )
          throw new OccurrenceAlreadyPaidError()
        if (!('amount' in occurrence))
          throw new Error('La ocurrencia no contiene un snapshot de monto.')
        const period = (
          await this.db.periods.where('ownerId').equals(input.ownerId).toArray()
        ).find(
          (candidate) =>
            candidate.deletedAt === null &&
            candidate.startDate <= input.paidDate &&
            input.paidDate <= candidate.endDate,
        )
        if (!period)
          throw new Error('No existe un periodo para la fecha de pago.')
        const payment = await this.db.recurringPayments.get(
          occurrence.recurringPaymentId,
        )
        if (
          !payment ||
          payment.ownerId !== input.ownerId ||
          payment.deletedAt !== null
        )
          throw new Error('El pago recurrente no existe.')
        const duplicate = await this.db.expenses
          .where('recurringOccurrenceId')
          .equals(occurrence.id)
          .first()
        if (duplicate?.deletedAt === null)
          throw new OccurrenceAlreadyPaidError()

        const now = this.sync.clock.now()
        const expenseAmount = input.actualAmountCents ?? occurrence.amount
        if (!Number.isSafeInteger(expenseAmount) || expenseAmount <= 0)
          throw new Error('El monto real debe ser un entero positivo.')
        const expense = {
          id: this.sync.ids.generate(),
          ownerId: input.ownerId,
          periodId: period.id,
          categoryId: payment.categoryId,
          amount: expenseAmount,
          description: payment.name,
          date: input.paidDate,
          recurringOccurrenceId: occurrence.id,
          affectsBalance: true,
          balanceEffectiveAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'pending' as const,
        }
        const updated = {
          ...occurrence,
          status: 'paid' as const,
          transactionId: expense.id,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }

        await this.db.expenses.add(expense)
        this.onStep('paid:expense-created')
        await this.db.recurringPaymentOccurrences.put(updated)
        this.onStep('paid:occurrence-updated')
        if (
          this.sync.origin === 'local-user' &&
          isAuthenticatedOwnerId(input.ownerId)
        ) {
          await this.db.syncOperations.add(
            createSyncOperation(
              this.sync,
              input.ownerId,
              'recurringPaymentOccurrence',
              occurrence.id,
              'pay_recurring_occurrence',
              { occurrence: updated, expense },
              now,
            ),
          )
        }
        return { occurrence: updated, expense }
      },
    )
  }

  async deleteLinkedExpense(ownerId: string, expenseId: string): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.expenses,
      this.db.recurringPaymentOccurrences,
      this.db.syncOperations,
      async () => {
        const expense = await this.db.expenses.get(expenseId)
        if (
          !expense ||
          expense.ownerId !== ownerId ||
          expense.deletedAt !== null ||
          !expense.recurringOccurrenceId
        )
          throw new Error('El gasto recurrente vinculado no existe.')

        const occurrence = await this.db.recurringPaymentOccurrences.get(
          expense.recurringOccurrenceId,
        )
        if (
          !occurrence ||
          occurrence.ownerId !== ownerId ||
          occurrence.deletedAt !== null ||
          occurrence.status !== 'paid'
        )
          throw new Error('La ocurrencia vinculada no está pagada.')

        const activeExpenses = await this.db.expenses
          .where('recurringOccurrenceId')
          .equals(occurrence.id)
          .filter(
            (candidate) =>
              candidate.ownerId === ownerId && candidate.deletedAt === null,
          )
          .toArray()
        if (activeExpenses.length !== 1 || activeExpenses[0]?.id !== expense.id)
          throw new Error(
            'La ocurrencia pagada debe tener exactamente un gasto activo.',
          )

        const now = this.sync.clock.now()
        const deletedExpense = {
          ...expense,
          deletedAt: now,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }
        const pendingOccurrence = {
          ...occurrence,
          status: 'pending' as const,
          transactionId: null,
          updatedAt: now,
          syncStatus: 'pending' as const,
        }

        await this.db.expenses.put(deletedExpense)
        this.onStep('delete:expense-soft-deleted')
        await this.db.recurringPaymentOccurrences.put(pendingOccurrence)
        this.onStep('delete:occurrence-reset')

        if (
          this.sync.origin === 'local-user' &&
          isAuthenticatedOwnerId(ownerId)
        ) {
          await this.db.syncOperations.bulkAdd([
            createSyncOperation(
              this.sync,
              ownerId,
              'expense',
              expense.id,
              'delete',
              deletedExpense,
              now,
            ),
            createSyncOperation(
              this.sync,
              ownerId,
              'recurringPaymentOccurrence',
              occurrence.id,
              'update',
              pendingOccurrence,
              now,
            ),
          ])
        }
      },
    )
  }
}
