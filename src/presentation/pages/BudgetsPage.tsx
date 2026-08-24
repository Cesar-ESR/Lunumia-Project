import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CategoryBudgetSummary } from '@application/use-cases/budgets/GetCategoryBudgetSummaries'
import { getLocalDateOnly } from '@shared/utils/date'
import { BudgetRow } from '../components/BudgetRow'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MetricBlock } from '../components/MetricBlock'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError } from '../utils/forms'

export function BudgetsPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    if (!activePeriod) return { categories: [], summaries: [], aggregate: null }
    const [categories, summaries, aggregate] = await Promise.all([
      services.categories.listCategories.execute(),
      services.budgets.getCategoryBudgetSummaries.execute({
        ownerId: services.ownerId,
        periodId: activePeriod.id,
      }),
      services.dashboard.getBudgetSummary.execute(
        activePeriod,
        getLocalDateOnly(),
      ),
    ])
    const summaryIds = new Set(summaries.map(({ categoryId }) => categoryId))
    if (categories.some(({ id }) => !summaryIds.has(id)))
      throw new Error('No pudimos cargar todos los datos de presupuesto.')
    return { categories, summaries, aggregate }
  }, [activePeriod, services])
  const data = useAsyncData(load)
  const [deletionCategoryId, setDeletionCategoryId] = useState<string | null>(
    null,
  )
  const [focusCategoryId, setFocusCategoryId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
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
            <Link className="button" to="/plan/periodos">
              Administrar periodos
            </Link>
          }
        />
      </>
    )
  const summaries = data.data?.summaries ?? []
  const summaryByCategory = new Map(
    summaries.map((summary) => [summary.categoryId, summary]),
  )
  const save = async (categoryId: string, amount: number) => {
    await services.budgets.upsertCategoryBudget.execute({
      ownerId: services.ownerId,
      periodId: activePeriod.id,
      categoryId,
      amount,
    })
    setNotice({ tone: 'success', message: 'Presupuesto guardado.' })
    setFocusCategoryId(categoryId)
    data.refresh()
  }
  const confirmDelete = async () => {
    if (!deletionCategoryId) return
    setIsDeleting(true)
    try {
      await services.budgets.deleteCategoryBudget.execute(
        activePeriod.id,
        deletionCategoryId,
      )
      const categoryId = deletionCategoryId
      setDeletionCategoryId(null)
      setNotice({
        tone: 'success',
        message:
          'Presupuesto quitado. La categoría y sus movimientos permanecen.',
      })
      setFocusCategoryId(categoryId)
      data.refresh()
    } catch (reason) {
      setNotice({ tone: 'error', message: friendlyError(reason) })
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
      />
      {notice ? <Notice {...notice} /> : null}
      {data.data?.aggregate ? (
        <Surface
          className="ln-budget-summary"
          aria-label="Resumen autoritativo de presupuestos"
        >
          <MetricBlock
            label="Total planeado"
            value={<MoneyDisplay amount={data.data.aggregate.totalBudget} />}
            supporting="Suma consolidada de los presupuestos del periodo."
          />
          <MetricBlock
            label="Restante total"
            value={
              <MoneyDisplay amount={data.data.aggregate.budgetRemaining} />
            }
            supporting="Resultado consolidado para el periodo seleccionado."
            state={
              data.data.aggregate.budgetRemaining < 0 ? 'negative' : 'known'
            }
            status={
              data.data.aggregate.budgetRemaining < 0
                ? 'El restante total es negativo.'
                : undefined
            }
          />
        </Surface>
      ) : null}
      <section id="budget-settings" className="ln-budget-settings">
        <div className="ln-section-heading">
          <div>
            <p className="eyebrow">Configuración</p>
            <h2>Presupuesto por categoría</h2>
            <p>
              Define o ajusta límites por categoría. Tu resumen total se
              actualiza con la información del periodo.
            </p>
          </div>
        </div>
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
              <Link className="button" to="/organizacion/categorias">
                Crear categoría
              </Link>
            }
          />
        ) : null}
        {data.data?.categories.length &&
        summaries.every(({ status }) => status === 'not_configured') ? (
          <EmptyState
            title="Aún no has definido presupuestos para este periodo"
            description="Asigna un monto a una categoría para comenzar a planear."
            action={
              <a
                className="ln-button ln-button--secondary"
                href="#budget-settings"
              >
                Crear presupuesto
              </a>
            }
          />
        ) : null}
        {data.data?.categories.length ? (
          <div className="ln-budget-list">
            {[...data.data.categories]
              .sort((left, right) => {
                const statusOrder: Record<
                  CategoryBudgetSummary['status'],
                  number
                > = { over: 0, within: 1, not_configured: 2 }
                const leftSummary = summaryByCategory.get(left.id)
                const rightSummary = summaryByCategory.get(right.id)

                if (!leftSummary || !rightSummary) {
                  return left.name.localeCompare(right.name, 'es')
                }

                return (
                  statusOrder[leftSummary.status] -
                    statusOrder[rightSummary.status] ||
                  left.name.localeCompare(right.name, 'es')
                )
              })
              .map((category) => {
                const summary = summaryByCategory.get(category.id)
                if (!summary) return null
                return (
                  <BudgetRow
                    key={category.id}
                    category={category}
                    summary={summary}
                    onSave={(amount) => save(category.id, amount)}
                    onDelete={
                      summary.status === 'not_configured'
                        ? undefined
                        : () => setDeletionCategoryId(category.id)
                    }
                    focusRequested={focusCategoryId === category.id}
                    onFocusHandled={() => setFocusCategoryId(null)}
                  />
                )
              })}
          </div>
        ) : null}
      </section>
      <ConfirmDialog
        open={Boolean(deletionCategoryId)}
        title="Quitar presupuesto"
        description="Sólo se quitará el límite planificado. La categoría y sus movimientos permanecerán."
        confirmLabel="Quitar presupuesto"
        destructive={false}
        isPending={isDeleting}
        onCancel={() => setDeletionCategoryId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
