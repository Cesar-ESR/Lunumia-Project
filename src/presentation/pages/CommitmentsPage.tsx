import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  PauseCircle,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { RecurringPayment } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { AttentionBlock } from '../components/AttentionBlock'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { InteractiveRow } from '../components/InteractiveRow'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError } from '../utils/forms'
import { formatCompactDate } from '../utils/movement-view-model'
import {
  groupOccurrenceViewModels,
  occurrenceToViewModel,
  type RecurringOccurrenceViewModel,
} from '../utils/recurring-occurrence-view-model'

function isCommitmentNoticeState(
  state: unknown,
): state is { commitmentNotice: string } {
  return (
    typeof state === 'object' &&
    state !== null &&
    'commitmentNotice' in state &&
    typeof state.commitmentNotice === 'string'
  )
}

const frequencyCopy = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
} as const

export function CommitmentsPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const location = useLocation()
  const today = getLocalDateOnly()
  const load = useCallback(async () => {
    if (
      activePeriod &&
      activePeriod.startDate <= today &&
      today <= activePeriod.endDate
    )
      await services.recurringPayments.generateOccurrencesForPeriod.execute(
        services.ownerId,
        activePeriod.id,
      )
    const [overview, categories, financial, expenses] = await Promise.all([
      services.recurringPayments.getOverview.execute(activePeriod?.id ?? null),
      services.categories.listCategories.execute(),
      services.dashboard.getFinancialSnapshot.execute(),
      activePeriod
        ? services.expenses.listExpensesByPeriod.execute(activePeriod.id)
        : Promise.resolve([]),
    ])
    return { ...overview, categories, financial, expenses }
  }, [activePeriod, services, today])
  const data = useAsyncData(load)
  const [planToDelete, setPlanToDelete] = useState<RecurringPayment | null>(
    null,
  )
  const [isPending, setIsPending] = useState(false)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const occurrences = useMemo(() => {
    if (!data.data) return []
    const plans = new Map(data.data.payments.map((plan) => [plan.id, plan]))
    const categories = new Map(
      data.data.categories.map((category) => [category.id, category]),
    )
    const expenses = new Map(
      data.data.expenses
        .filter((expense) => expense.recurringOccurrenceId !== null)
        .map((expense) => [expense.recurringOccurrenceId!, expense]),
    )
    return data.data.occurrences.map((occurrence) => {
      const plan = plans.get(occurrence.recurringPaymentId)
      return occurrenceToViewModel({
        occurrence,
        payment: plan,
        category: plan ? categories.get(plan.categoryId) : undefined,
        linkedExpense: expenses.get(occurrence.id),
        today,
      })
    })
  }, [data.data, today])
  const groups = useMemo(
    () => groupOccurrenceViewModels(occurrences),
    [occurrences],
  )

  const togglePlan = async (plan: RecurringPayment) => {
    setIsPending(true)
    setNotice(null)
    try {
      await services.recurringPayments.toggleRecurringPaymentStatus.execute(
        plan.id,
      )
      setNotice({
        tone: 'success',
        message:
          plan.status === 'active'
            ? 'Plan pausado. Sus ocurrencias existentes no cambiaron.'
            : 'Plan reactivado.',
      })
      data.refresh()
    } catch (reason) {
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }

  const deletePlan = async () => {
    if (!planToDelete) return
    setIsPending(true)
    setNotice(null)
    try {
      await services.recurringPayments.deleteRecurringPayment.execute(
        planToDelete.id,
      )
      setPlanToDelete(null)
      setNotice({
        tone: 'success',
        message:
          'Plan eliminado. El historial de ocurrencias permanece sin cambios.',
      })
      data.refresh()
    } catch (reason) {
      setPlanToDelete(null)
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }

  if (data.status === 'loading' && !data.data)
    return (
      <>
        <PageHeader eyebrow="Plan" title="Compromisos" />
        <LoadingState message="Preparando tus compromisos…" />
      </>
    )
  if (data.status === 'error')
    return (
      <>
        <PageHeader eyebrow="Plan" title="Compromisos" />
        <ErrorState
          message="No pudimos cargar tus compromisos."
          onRetry={data.refresh}
        />
      </>
    )
  if (!data.data) return null

  const hasPending =
    groups.overdue.length + groups.immediate.length + groups.upcoming.length > 0

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Compromisos"
        description={
          activePeriod
            ? `${formatCompactDate(activePeriod.startDate)} — ${formatCompactDate(activePeriod.endDate)}`
            : 'Planes recurrentes y sus pagos concretos.'
        }
        actions={
          <Link
            className="ln-button ln-button--primary"
            to="/plan/compromisos/planes/nuevo"
          >
            Crear plan recurrente
          </Link>
        }
      />
      {isCommitmentNoticeState(location.state) ? (
        <Notice message={location.state.commitmentNotice} />
      ) : null}
      {notice ? <Notice {...notice} /> : null}

      {data.data.financial.overdueCommittedCents > 0 ? (
        <AttentionBlock
          tone="warning"
          heading="Resumen general de compromisos vencidos"
          action={
            <Link
              className="ln-button ln-button--secondary"
              to="/plan/periodos"
            >
              Cambiar periodo
            </Link>
          }
        >
          <p>
            La lectura general incluye{' '}
            <MoneyDisplay amount={data.data.financial.overdueCommittedCents} />{' '}
            en compromisos vencidos. Aquí ves el detalle del periodo
            seleccionado; cambia de periodo para consultar sus demás
            ocurrencias.
          </p>
        </AttentionBlock>
      ) : null}

      {!activePeriod ? (
        <EmptyState
          title="Selecciona un periodo"
          description="Los planes siguen disponibles, pero necesitas un periodo activo para consultar sus ocurrencias."
          action={
            <Link
              className="ln-button ln-button--secondary"
              to="/plan/periodos"
            >
              Administrar periodos
            </Link>
          }
        />
      ) : null}

      {groups.overdue.length ? (
        <OccurrenceSection
          id="overdue-commitments"
          title="Vencidos"
          description="Compromisos pendientes con una fecha anterior a hoy."
          icon={<CircleAlert aria-hidden="true" />}
          occurrences={groups.overdue}
          tone="danger"
        />
      ) : null}
      {groups.immediate.length ? (
        <OccurrenceSection
          id="immediate-commitments"
          title="Hoy y mañana"
          description="Los compromisos que requieren atención inmediata."
          icon={<CalendarClock aria-hidden="true" />}
          occurrences={groups.immediate}
          tone="warning"
        />
      ) : null}
      {groups.upcoming.length ? (
        <OccurrenceSection
          id="upcoming-commitments"
          title="Próximos"
          description="Compromisos pendientes más adelante en este periodo."
          icon={<CalendarCheck aria-hidden="true" />}
          occurrences={groups.upcoming}
        />
      ) : null}
      {activePeriod && !hasPending ? (
        <EmptyState
          title="No hay compromisos pendientes"
          description="No hay ocurrencias vencidas ni próximas en el periodo seleccionado."
        />
      ) : null}

      <section
        className="ln-commitment-section"
        aria-labelledby="commitment-history"
      >
        <div className="ln-section-heading">
          <div>
            <p className="eyebrow">Ocurrencias</p>
            <h2 id="commitment-history">Historial</h2>
            <p>Pagos registrados y ocurrencias omitidas del periodo.</p>
          </div>
        </div>
        {groups.history.length ? (
          <OccurrenceList occurrences={groups.history} />
        ) : (
          <EmptyState
            title="No hay historial todavía"
            description="Los pagos y omisiones aparecerán aquí sin modificar el plan original."
          />
        )}
      </section>

      <section
        className="ln-commitment-section"
        aria-labelledby="recurring-plans"
      >
        <div className="ln-section-heading">
          <div>
            <p className="eyebrow">Planes recurrentes</p>
            <h2 id="recurring-plans">Qué se repite</h2>
            <p>
              Editar un plan afecta el comportamiento futuro, no los montos
              históricos ya generados.
            </p>
          </div>
        </div>
        {data.data.payments.length ? (
          <div className="ln-plan-grid">
            {data.data.payments.map((plan) => (
              <Surface key={plan.id} as="article" className="ln-plan-card">
                <div className="ln-plan-card__heading">
                  <div>
                    <span
                      className={`ln-status-label ln-status-label--${plan.status}`}
                    >
                      {plan.status === 'active' ? 'Activo' : 'Pausado'}
                    </span>
                    <h3>{plan.name}</h3>
                  </div>
                  <MoneyDisplay amount={plan.amount} />
                </div>
                <p>
                  {frequencyCopy[plan.frequency]} · desde{' '}
                  {formatCompactDate(plan.dueDate)}
                  {plan.endDate
                    ? ` · hasta ${formatCompactDate(plan.endDate)}`
                    : ''}
                </p>
                <div className="ln-plan-actions">
                  <Link
                    className="ln-button ln-button--secondary"
                    to={`/plan/compromisos/planes/${plan.id}`}
                  >
                    <Pencil aria-hidden="true" /> Editar plan
                  </Link>
                  <button
                    type="button"
                    className="ln-button ln-button--ghost"
                    disabled={isPending}
                    onClick={() => void togglePlan(plan)}
                  >
                    {plan.status === 'active' ? (
                      <>
                        <PauseCircle aria-hidden="true" /> Pausar plan
                      </>
                    ) : (
                      <>
                        <RefreshCw aria-hidden="true" /> Reactivar plan
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ln-button ln-button--link ln-plan-delete"
                    onClick={() => setPlanToDelete(plan)}
                  >
                    Eliminar plan
                  </button>
                </div>
              </Surface>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No hay planes recurrentes"
            description="Crea un plan para materializar sus compromisos en el periodo actual."
            action={
              <Link
                className="ln-button ln-button--primary"
                to="/plan/compromisos/planes/nuevo"
              >
                Crear primer plan
              </Link>
            }
          />
        )}
      </section>

      <ConfirmDialog
        open={Boolean(planToDelete)}
        title="Eliminar plan recurrente"
        description={
          planToDelete
            ? `Se eliminará el plan “${planToDelete.name}”. No se generarán nuevas ocurrencias y el historial existente permanecerá sin cambios.`
            : ''
        }
        confirmLabel="Eliminar plan"
        isPending={isPending}
        onCancel={() => setPlanToDelete(null)}
        onConfirm={() => void deletePlan()}
      />
    </>
  )
}

function OccurrenceSection({
  id,
  title,
  description,
  icon,
  occurrences,
  tone,
}: {
  id: string
  title: string
  description: string
  icon: ReactNode
  occurrences: RecurringOccurrenceViewModel[]
  tone?: 'danger' | 'warning'
}) {
  return (
    <section
      className={`ln-commitment-section${tone ? ` ln-commitment-section--${tone}` : ''}`}
      aria-labelledby={id}
    >
      <div className="ln-section-heading">
        <div className="ln-section-heading__icon" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <OccurrenceList occurrences={occurrences} />
    </section>
  )
}

function OccurrenceList({
  occurrences,
}: {
  occurrences: RecurringOccurrenceViewModel[]
}) {
  return (
    <Surface
      className="ln-occurrence-list"
      aria-label="Compromisos de esta sección"
    >
      {occurrences.map((occurrence) => (
        <InteractiveRow
          key={occurrence.id}
          leading={statusIcon(occurrence.status)}
          className={`ln-occurrence-row ln-occurrence-row--${occurrence.status}`}
          action={
            <Link
              className="ln-row-link"
              to={occurrence.navigationTarget}
              aria-label={`Abrir ${occurrence.planName}, ${occurrence.statusLabel}`}
            >
              <ChevronRight aria-hidden="true" />
            </Link>
          }
        >
          <div className="ln-occurrence-row__main">
            <div>
              <h3>{occurrence.planName}</h3>
              <p>
                {occurrence.dateContext} · {occurrence.categoryName}
              </p>
              {occurrence.paidDate ? (
                <p>Pagado el {formatCompactDate(occurrence.paidDate)}</p>
              ) : null}
            </div>
            <div className="ln-occurrence-row__amount">
              {occurrence.amountCents === null ? (
                <span>Monto no disponible</span>
              ) : (
                <MoneyDisplay amount={occurrence.amountCents} />
              )}
              <span
                className={`ln-status-label ln-status-label--${occurrence.status}`}
              >
                {occurrence.statusLabel}
              </span>
            </div>
          </div>
        </InteractiveRow>
      ))}
    </Surface>
  )
}

function statusIcon(status: RecurringOccurrenceViewModel['status']) {
  if (status === 'paid') return <CircleCheck aria-hidden="true" />
  if (status === 'skipped') return <CircleSlash aria-hidden="true" />
  if (status === 'overdue') return <CircleAlert aria-hidden="true" />
  return <CalendarClock aria-hidden="true" />
}
