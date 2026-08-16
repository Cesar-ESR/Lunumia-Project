import type {
  IncomeV2,
  Period,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

import { getPeriodTemporalState } from './period-temporal-state'

export const isOccurrenceOverdue = (
  occurrence: RecurringPaymentOccurrence,
  today: DateOnly,
): boolean =>
  occurrence.deletedAt === null &&
  occurrence.status === 'pending' &&
  occurrence.dueDate < today

export const isExpectedIncomeOverdue = (
  income: IncomeV2,
  today: DateOnly,
): boolean =>
  income.deletedAt === null &&
  income.status === 'expected' &&
  income.date < today

export function isPeriodAnalyzable(
  period: Period,
  occurrences: readonly RecurringPaymentOccurrence[],
  today: DateOnly,
): boolean {
  if (getPeriodTemporalState(period, today) !== 'ended') return false

  return !occurrences.some(
    (occurrence) =>
      occurrence.deletedAt === null &&
      occurrence.periodId === period.id &&
      occurrence.status === 'pending',
  )
}
