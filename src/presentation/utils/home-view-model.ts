import type { CategoryBudgetSummary } from '@application/use-cases/budgets/GetCategoryBudgetSummaries'
import type { FinancialSnapshot } from '@domain/calculations'
import type {
  Category,
  Expense,
  Income,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'
import type { SyncContextValue } from '../context/SyncContext'
import {
  expenseToMovementViewModel,
  formatCompactDate,
  incomeToMovementViewModel,
  sortMovements,
  type MovementListItem,
} from './movement-view-model'
import {
  occurrenceToViewModel,
  type RecurringOccurrenceViewModel,
} from './recurring-occurrence-view-model'

export interface HomePrimaryAction {
  kind: 'balance' | 'commitments' | 'register'
  label: string
  to: string
}

export type HomeAttentionItem =
  | { kind: 'overdue-commitments'; amountCents: number }
  | { kind: 'overdue-expected-income'; amountCents: number }
  | { kind: 'budget-over'; categoryId: string; categoryName: string }
  | { kind: 'sync-error'; message: string }

type AttentionSyncState = Pick<
  SyncContextValue,
  'canRetryManually' | 'error' | 'isAvailable' | 'ownerId' | 'status'
>

export function selectHomePrimaryAction(
  snapshot: FinancialSnapshot,
): HomePrimaryAction {
  if (snapshot.openingBalanceCents === null)
    return {
      kind: 'balance',
      label: 'Agregar saldo inicial',
      to: '/saldo/inicial',
    }
  if (snapshot.overdueCommittedCents > 0)
    return {
      kind: 'commitments',
      label: 'Revisar compromisos',
      to: '/plan/compromisos',
    }
  return {
    kind: 'register',
    label: 'Registrar movimiento',
    to: '/movimientos',
  }
}

export function buildHomeAttentionItems({
  snapshot,
  budgetSummaries,
  categories,
  sync,
}: {
  snapshot: FinancialSnapshot | null
  budgetSummaries: readonly CategoryBudgetSummary[] | null
  categories: readonly Category[]
  sync: AttentionSyncState
}): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = []
  if (snapshot && snapshot.overdueCommittedCents > 0)
    items.push({
      kind: 'overdue-commitments',
      amountCents: snapshot.overdueCommittedCents,
    })
  if (snapshot && snapshot.overdueExpectedIncomeCents > 0)
    items.push({
      kind: 'overdue-expected-income',
      amountCents: snapshot.overdueExpectedIncomeCents,
    })

  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  )
  const exceeded = (budgetSummaries ?? [])
    .filter(({ status }) => status === 'over')
    .map((summary) => ({
      summary,
      name:
        categoriesById.get(summary.categoryId)?.name ??
        'Categoría no disponible',
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, 'es') ||
        left.summary.categoryId.localeCompare(right.summary.categoryId),
    )
    .slice(0, 2)

  items.push(
    ...exceeded.map<HomeAttentionItem>(({ summary, name }) => ({
      kind: 'budget-over',
      categoryId: summary.categoryId,
      categoryName: name,
    })),
  )

  if (
    sync.isAvailable &&
    sync.ownerId &&
    sync.status === 'error' &&
    sync.canRetryManually
  )
    items.push({
      kind: 'sync-error',
      message:
        sync.error?.message ?? 'No fue posible completar la sincronización.',
    })

  return items.slice(0, 3)
}

export function selectNextCommitment({
  occurrences,
  payments,
  categories,
  today,
}: {
  occurrences: readonly RecurringPaymentOccurrence[]
  payments: readonly RecurringPayment[]
  categories: readonly Category[]
  today: DateOnly
}): RecurringOccurrenceViewModel | null {
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]))
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  )
  return (
    occurrences
      .map((occurrence) => {
        const payment = paymentsById.get(occurrence.recurringPaymentId)
        return occurrenceToViewModel({
          occurrence,
          payment,
          category: payment
            ? categoriesById.get(payment.categoryId)
            : undefined,
          linkedExpense: undefined,
          today,
        })
      })
      .filter(
        ({ status }) =>
          status === 'due-today' ||
          status === 'due-tomorrow' ||
          status === 'upcoming',
      )
      .sort(
        (left, right) =>
          left.dueDate.localeCompare(right.dueDate) ||
          left.id.localeCompare(right.id),
      )[0] ?? null
  )
}

export function selectNextExpectedIncome(
  incomes: readonly Income[],
  today: DateOnly,
): MovementListItem | null {
  return (
    incomes
      .map(incomeToMovementViewModel)
      .filter(
        (income) => income.kind === 'income-expected' && income.date >= today,
      )
      .sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )[0] ?? null
  )
}

export function selectRecentActivity({
  incomes,
  expenses,
  categories,
}: {
  incomes: readonly Income[]
  expenses: readonly Expense[]
  categories: readonly Category[]
}): MovementListItem[] {
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  )
  const received = incomes
    .map(incomeToMovementViewModel)
    .filter(({ kind }) => kind === 'income-received')
  return sortMovements([
    ...received,
    ...expenses.map((expense) =>
      expenseToMovementViewModel(
        expense,
        categoriesById.get(expense.categoryId),
      ),
    ),
  ]).slice(0, 5)
}

export function formatHomeEventDate(date: DateOnly, today: DateOnly): string {
  if (date === today) return 'Hoy'
  if (date === addDateOnlyDays(today, 1)) return 'Mañana'
  return formatCompactDate(date)
}

function addDateOnlyDays(date: DateOnly, days: number): DateOnly {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year!, month! - 1, day! + days))
  return next.toISOString().slice(0, 10)
}
