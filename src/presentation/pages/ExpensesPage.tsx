import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Expense } from '@domain/entities'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { ExpenseForm, type ExpenseFormValue } from '../components/ExpenseForm'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAuth } from '../context/AuthContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAIAvailability } from '../hooks/useAIAvailability'
import { friendlyError } from '../utils/forms'
import { formatCentsForInput } from '../utils/money-input'

export function ExpensesPage() {
  const services = useApplicationServices()
  const auth = useAuth()
  const canUseAI = useAIAvailability(Boolean(services.aiInsights))
  const location = useLocation()
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    if (!activePeriod) return { expenses: [], categories: [] }
    const [expenses, categories] = await Promise.all([
      services.expenses.listExpensesByPeriod.execute(activePeriod.id),
      services.categories.listCategories.execute(),
    ])
    return { expenses, categories }
  }, [activePeriod, services])
  const data = useAsyncData(load)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deletion, setDeletion] = useState<Expense | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Movimientos"
          title="Gastos"
          description="Registra en qué usas tu dinero."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo antes de registrar gastos."
          action={
            <div className="page-actions">
              <Link className="button" to="/expenses/receipt">
                Escanear recibo
              </Link>
              <Link className="button secondary" to="/periods">
                Administrar periodos
              </Link>
            </div>
          }
        />
      </>
    )
  const save = async (value: ExpenseFormValue) => {
    if (editing)
      await services.expenses.updateExpense.execute(editing.id, value)
    else await services.expenses.createExpense.execute(value)
    setEditing(null)
    data.refresh()
  }
  const confirmDelete = async () => {
    if (!deletion) return
    setIsDeleting(true)
    try {
      await services.expenses.deleteExpense.execute(deletion.id)
      if (editing?.id === deletion.id) setEditing(null)
      setDeletion(null)
      data.refresh()
    } catch (reason) {
      setNotice(friendlyError(reason))
    } finally {
      setIsDeleting(false)
    }
  }
  const expenses = data.data?.expenses ?? []
  const categories = data.data?.categories ?? []
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  return (
    <>
      <PageHeader
        eyebrow="Movimientos"
        title="Gastos"
        description={`${activePeriod.startDate} — ${activePeriod.endDate}`}
        actions={
          <div className="page-actions">
            <Link className="button" to="/expenses/receipt">
              Escanear recibo
            </Link>
            <div className="summary-pill">
              <span>Total</span>
              <MoneyDisplay amount={total} />
            </div>
          </div>
        }
      />
      {isReceiptCreatedState(location.state) ? (
        <Notice message="Gasto guardado en este dispositivo." />
      ) : null}
      {notice ? <Notice tone="error" message={notice} /> : null}
      <div className="split-layout">
        <section className="panel">
          <h2>{editing ? 'Editar gasto' : 'Nuevo gasto'}</h2>
          {data.status === 'loading' && !data.data ? (
            <LoadingState message="Preparando formulario…" />
          ) : (
            <ExpenseForm
              key={editing?.id ?? 'new'}
              ownerId={services.ownerId}
              period={activePeriod}
              categories={categories}
              initialExpense={editing ?? undefined}
              categorySuggestionAction={
                services.aiInsights?.suggestExpenseCategory ?? null
              }
              aiSuggestionEnabled={canUseAI}
              aiIdentityKey={`${auth.ownerId}:${auth.user?.id ?? 'guest'}`}
              onSubmit={save}
              onCancel={editing ? () => setEditing(null) : undefined}
            />
          )}
        </section>
        <section className="panel">
          <h2>Gastos del periodo</h2>
          {data.status === 'loading' && !data.data ? (
            <LoadingState message="Cargando gastos…" />
          ) : null}
          {data.status === 'error' ? (
            <ErrorState message={data.error.message} onRetry={data.refresh} />
          ) : null}
          {expenses.length === 0 && data.status === 'success' ? (
            <EmptyState
              title="Aún no hay gastos"
              description="Registra el primer gasto de este periodo."
            />
          ) : null}
          {expenses.length ? (
            <div className="record-list">
              {expenses.map((expense) => (
                <article className="record-card" key={expense.id}>
                  <div>
                    <p className="record-date">
                      {expense.date} ·{' '}
                      {categoryNames.get(expense.categoryId) ?? 'Sin categoría'}
                    </p>
                    <h3>{expense.description}</h3>
                    <MoneyDisplay
                      amount={expense.amount}
                      className="record-amount"
                    />
                  </div>
                  <div className="record-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setEditing(expense)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="button ghost danger-text"
                      onClick={() => setDeletion(expense)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deletion)}
        title="Eliminar gasto"
        description={
          deletion
            ? `Se eliminará “${deletion.description}” por ${formatCentsForInput(deletion.amount)} MXN.`
            : ''
        }
        confirmLabel="Eliminar gasto"
        isPending={isDeleting}
        onCancel={() => setDeletion(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

function isReceiptCreatedState(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'receiptCreated' in value &&
    value.receiptCreated === true
  )
}
