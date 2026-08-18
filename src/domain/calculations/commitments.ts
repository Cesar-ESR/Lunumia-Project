import type { RecurringPaymentOccurrence } from '@domain/entities'
import { DomainError } from '@domain/errors'
import type { AmountCents, DateOnly } from '@domain/value-objects'

export interface CommitmentTotals {
  overdueCommittedCents: AmountCents
  upcomingCommittedCents: AmountCents
  committedCents: AmountCents
}

export function calculateCommitments(
  occurrences: readonly RecurringPaymentOccurrence[],
  today: DateOnly,
  projectionEnd: DateOnly | null,
): CommitmentTotals {
  let overdueCommittedCents = 0
  let upcomingCommittedCents = 0

  for (const occurrence of occurrences) {
    if (occurrence.deletedAt !== null || occurrence.status !== 'pending')
      continue
    if (!('amount' in occurrence))
      throw new DomainError(
        'No se puede calcular un compromiso sin el snapshot de monto de la ocurrencia.',
      )
    if (occurrence.dueDate < today) {
      overdueCommittedCents += occurrence.amount
      continue
    }
    if (projectionEnd !== null && occurrence.dueDate <= projectionEnd)
      upcomingCommittedCents += occurrence.amount
  }

  return {
    overdueCommittedCents,
    upcomingCommittedCents,
    committedCents: overdueCommittedCents + upcomingCommittedCents,
  }
}
