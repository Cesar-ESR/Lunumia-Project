import type {
  Category,
  Expense,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import { isOccurrenceOverdue } from '@domain/rules'
import type { DateOnly } from '@domain/value-objects'
import { formatCompactDate } from './movement-view-model'

export type OccurrencePresentationStatus =
  'overdue' | 'due-today' | 'due-tomorrow' | 'upcoming' | 'paid' | 'skipped'

export interface RecurringOccurrenceViewModel {
  id: string
  planId: string
  planName: string
  amountCents: number | null
  amountUnavailable: boolean
  dueDate: DateOnly
  status: OccurrencePresentationStatus
  statusLabel: string
  dateContext: string
  categoryName: string
  linkedExpenseId: string | null
  actualPaidAmountCents: number | null
  paidDate: DateOnly | null
  navigationTarget: string
}

function addDays(date: DateOnly, days: number): DateOnly {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year!, month! - 1, day! + days))
  return next.toISOString().slice(0, 10)
}

function daysBetween(from: DateOnly, to: DateOnly): number {
  const toUtc = (value: DateOnly) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year!, month! - 1, day!)
  }
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
}

function temporalStatus(
  occurrence: RecurringPaymentOccurrence,
  today: DateOnly,
): Pick<
  RecurringOccurrenceViewModel,
  'status' | 'statusLabel' | 'dateContext'
> {
  if (occurrence.status === 'paid')
    return {
      status: 'paid',
      statusLabel: 'Pagado',
      dateContext: `Vencimiento ${formatCompactDate(occurrence.dueDate)}`,
    }
  if (occurrence.status === 'skipped')
    return {
      status: 'skipped',
      statusLabel: 'Omitido',
      dateContext: `Vencimiento ${formatCompactDate(occurrence.dueDate)}`,
    }
  if (isOccurrenceOverdue(occurrence, today)) {
    const days = daysBetween(occurrence.dueDate, today)
    return {
      status: 'overdue',
      statusLabel: 'Vencido',
      dateContext: `Vencido hace ${days} ${days === 1 ? 'día' : 'días'} · ${formatCompactDate(occurrence.dueDate)}`,
    }
  }
  if (occurrence.dueDate === today)
    return {
      status: 'due-today',
      statusLabel: 'Vence hoy',
      dateContext: `Hoy · ${formatCompactDate(occurrence.dueDate)}`,
    }
  if (occurrence.dueDate === addDays(today, 1))
    return {
      status: 'due-tomorrow',
      statusLabel: 'Vence mañana',
      dateContext: `Mañana · ${formatCompactDate(occurrence.dueDate)}`,
    }
  return {
    status: 'upcoming',
    statusLabel: 'Próximo',
    dateContext: formatCompactDate(occurrence.dueDate),
  }
}

export function occurrenceToViewModel({
  occurrence,
  payment,
  category,
  linkedExpense,
  today,
}: {
  occurrence: RecurringPaymentOccurrence
  payment: RecurringPayment | undefined
  category: Category | undefined
  linkedExpense: Expense | undefined
  today: DateOnly
}): RecurringOccurrenceViewModel {
  return {
    id: occurrence.id,
    planId: occurrence.recurringPaymentId,
    planName: payment?.name ?? 'Plan no disponible',
    // Never fall back to payment.amount: legacy occurrences must be explicit.
    amountCents: 'amount' in occurrence ? occurrence.amount : null,
    amountUnavailable: !('amount' in occurrence),
    dueDate: occurrence.dueDate,
    ...temporalStatus(occurrence, today),
    categoryName: category?.name ?? 'Sin categoría',
    linkedExpenseId: linkedExpense?.id ?? null,
    actualPaidAmountCents: linkedExpense?.amount ?? null,
    paidDate: linkedExpense?.date ?? null,
    navigationTarget: `/plan/compromisos/${occurrence.id}`,
  }
}

export interface OccurrenceGroups {
  overdue: RecurringOccurrenceViewModel[]
  immediate: RecurringOccurrenceViewModel[]
  upcoming: RecurringOccurrenceViewModel[]
  history: RecurringOccurrenceViewModel[]
}

export function groupOccurrenceViewModels(
  occurrences: readonly RecurringOccurrenceViewModel[],
): OccurrenceGroups {
  const ascending = (
    left: RecurringOccurrenceViewModel,
    right: RecurringOccurrenceViewModel,
  ) =>
    left.dueDate.localeCompare(right.dueDate) || left.id.localeCompare(right.id)
  const descending = (
    left: RecurringOccurrenceViewModel,
    right: RecurringOccurrenceViewModel,
  ) =>
    right.dueDate.localeCompare(left.dueDate) || right.id.localeCompare(left.id)
  return {
    overdue: occurrences
      .filter(({ status }) => status === 'overdue')
      .sort(ascending),
    immediate: occurrences
      .filter(
        ({ status }) => status === 'due-today' || status === 'due-tomorrow',
      )
      .sort(ascending),
    upcoming: occurrences
      .filter(({ status }) => status === 'upcoming')
      .sort(ascending),
    history: occurrences
      .filter(({ status }) => status === 'paid' || status === 'skipped')
      .sort(descending),
  }
}
