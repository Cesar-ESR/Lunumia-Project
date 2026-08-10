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
        const period = await this.db.periods.get(occurrence.periodId)
        if (
          !period ||
          period.ownerId !== input.ownerId ||
          period.deletedAt !== null
        )
          throw new Error('El periodo de la ocurrencia no existe.')
        if (
          input.paidDate < period.startDate ||
          input.paidDate > period.endDate
        )
          throw new Error(
            'La fecha de pago debe estar dentro del periodo activo.',
          )
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
        const expense = {
          id: this.sync.ids.generate(),
          ownerId: input.ownerId,
          periodId: occurrence.periodId,
          categoryId: payment.categoryId,
          amount: payment.amount,
          description: payment.name,
          date: input.paidDate,
          recurringOccurrenceId: occurrence.id,
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
        await this.db.recurringPaymentOccurrences.put(updated)
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
}
