import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CategoryBudget } from '@domain/entities'
import { BudgetRow } from '../components/BudgetRow'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError } from '../utils/forms'

export function BudgetsPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    if (!activePeriod) return { categories: [], budgets: [] }
    const [categories, budgets] = await Promise.all([
      services.categories.listCategories.execute(),
      services.budgets.listBudgetsByPeriod.execute(activePeriod.id),
    ])
    return { categories, budgets }
  }, [activePeriod, services])
  const data = useAsyncData(load)
  const [deletion, setDeletion] = useState<CategoryBudget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Planeación"
          title="Presupuestos"
          description="Decide cuánto quieres destinar a cada categoría."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo para definir presupuestos."
          action={
            <Link className="button" to="/periods">
              Administrar periodos
            </Link>
          }
        />
      </>
    )
  const budgets = data.data?.budgets ?? []
  const budgetByCategory = new Map(
    budgets.map((budget) => [budget.categoryId, budget]),
  )
  const total = budgets.reduce((sum, budget) => sum + budget.amount, 0)
  const save = async (categoryId: string, amount: number) => {
    await services.budgets.upsertCategoryBudget.execute({
      ownerId: services.ownerId,
      periodId: activePeriod.id,
      categoryId,
      amount,
    })
    data.refresh()
  }
  const confirmDelete = async () => {
    if (!deletion) return
    setIsDeleting(true)
    try {
      await services.budgets.deleteCategoryBudget.execute(
        deletion.periodId,
        deletion.categoryId,
      )
      setDeletion(null)
      data.refresh()
    } catch (reason) {
      setNotice(friendlyError(reason))
    } finally {
      setIsDeleting(false)
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Planeación"
        title="Presupuestos"
        description={`${activePeriod.startDate} — ${activePeriod.endDate}`}
        actions={
          <div className="summary-pill">
            <span>Total planeado</span>
            <MoneyDisplay amount={total} />
          </div>
        }
      />
      {notice ? <Notice tone="error" message={notice} /> : null}
      <section className="panel">
        <h2>Presupuesto por categoría</h2>
        {data.status === 'loading' && !data.data ? (
          <LoadingState message="Cargando presupuestos…" />
        ) : null}
        {data.status === 'error' ? (
          <ErrorState message={data.error.message} onRetry={data.refresh} />
        ) : null}
        {data.data?.categories.length === 0 ? (
          <EmptyState
            title="No hay categorías"
            description="Crea una categoría para asignarle presupuesto."
            action={
              <Link className="button" to="/categories">
                Crear categoría
              </Link>
            }
          />
        ) : null}
        {data.data?.categories.length ? (
          <div className="budget-list">
            {data.data.categories.map((category) => {
              const budget = budgetByCategory.get(category.id)
              return (
                <BudgetRow
                  key={`${category.id}-${budget?.amount ?? 'none'}`}
                  category={category}
                  amount={budget?.amount ?? null}
                  onSave={(amount) => save(category.id, amount)}
                  onDelete={budget ? () => setDeletion(budget) : undefined}
                />
              )
            })}
          </div>
        ) : null}
      </section>
      <ConfirmDialog
        open={Boolean(deletion)}
        title="Quitar presupuesto"
        description="La categoría quedará sin un monto planeado para este periodo."
        confirmLabel="Quitar presupuesto"
        isPending={isDeleting}
        onCancel={() => setDeletion(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
