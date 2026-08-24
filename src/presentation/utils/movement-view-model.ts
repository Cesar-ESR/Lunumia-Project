import type { Category, Expense, Income } from '@domain/entities'

export type MovementKind =
  'expense' | 'income-received' | 'income-expected' | 'income-cancelled'

export interface MovementListItem {
  id: string
  kind: MovementKind
  description: string
  amountCents: number
  date: string
  createdAt: string
  categoryOrOrigin: string
  categoryId: string | null
  statusLabel: string
  historical: boolean
  historicalContext: string | null
  recurringLinked: boolean
  recurringContext: string | null
  navigationTarget: string | null
}

export function incomeToMovementViewModel(income: Income): MovementListItem {
  // Database v4 migrates legacy records to received + affectsBalance=true.
  // The fallback mirrors that compatibility meaning until every store is migrated.
  const status = 'status' in income ? income.status : 'received'
  const historical =
    'status' in income && income.status === 'received' && !income.affectsBalance
  const kind: MovementKind =
    status === 'expected'
      ? 'income-expected'
      : status === 'cancelled'
        ? 'income-cancelled'
        : 'income-received'
  const statusLabel =
    status === 'expected'
      ? 'Esperado'
      : status === 'cancelled'
        ? 'Expectativa cancelada'
        : 'Recibido'

  return {
    id: income.id,
    kind,
    description: income.description,
    amountCents: income.amount,
    date: income.date,
    createdAt: income.createdAt,
    categoryOrOrigin: 'Ingreso',
    categoryId: null,
    statusLabel,
    historical,
    historicalContext: historical
      ? 'Agregado al historial · Ya estaba reflejado en tu saldo'
      : null,
    recurringLinked: false,
    recurringContext: null,
    navigationTarget:
      status === 'expected' || status === 'cancelled'
        ? `/movimientos/ingresos/${income.id}`
        : null,
  }
}

export function expenseToMovementViewModel(
  expense: Expense,
  category: Category | undefined,
): MovementListItem {
  const historical = 'affectsBalance' in expense && !expense.affectsBalance
  return {
    id: expense.id,
    kind: 'expense',
    description: expense.description,
    amountCents: -expense.amount,
    date: expense.date,
    createdAt: expense.createdAt,
    categoryOrOrigin: category?.name ?? 'Sin categoría',
    categoryId: expense.categoryId,
    statusLabel: 'Gasto',
    historical,
    historicalContext: historical
      ? 'Agregado al historial · Ya estaba reflejado en tu saldo'
      : null,
    recurringLinked: expense.recurringOccurrenceId !== null,
    recurringContext:
      expense.recurringOccurrenceId !== null ? 'Desde compromiso' : null,
    navigationTarget: expense.recurringOccurrenceId
      ? `/plan/compromisos/${expense.recurringOccurrenceId}`
      : null,
  }
}

export function sortMovements(
  movements: readonly MovementListItem[],
): MovementListItem[] {
  return [...movements].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  )
}

export function formatCompactDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace('.', '')
}

export function formatDetailDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}
