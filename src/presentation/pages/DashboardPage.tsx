import { useCallback, type ReactNode } from 'react'
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { FinancialSnapshot } from '@domain/calculations'
import type { SignedMoneyCents } from '@domain/value-objects'
import { getLocalDateOnly } from '@shared/utils/date'
import { AttentionBlock } from '../components/AttentionBlock'
import { ErrorState } from '../components/ErrorState'
import { HomeUsageProgress } from '../components/HomeUsageProgress'
import { InteractiveRow } from '../components/InteractiveRow'
import { LoadingState } from '../components/LoadingState'
import { MetricBlock } from '../components/MetricBlock'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useSync } from '../context/SyncContext'
import { useAsyncData } from '../hooks/useAsyncData'
import {
  buildHomeAttentionItems,
  formatHomeEventDate,
  selectHomePrimaryAction,
  selectNextCommitment,
  selectNextExpectedIncome,
  selectRecentActivity,
  type HomeAttentionItem,
} from '../utils/home-view-model'
import {
  formatCompactDate,
  type MovementListItem,
} from '../utils/movement-view-model'
import {
  projectionCoverageViewModel,
  projectionHorizonLabel,
  projectionMetricState,
} from '../utils/projection-view-model'

function FinancialValue({ amount }: { amount: SignedMoneyCents | null }) {
  return amount === null ? 'No calculable' : <MoneyDisplay amount={amount} />
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string
  eyebrow: string
  title: string
  description: ReactNode
}) {
  return (
    <div className="ln-section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const sync = useSync()
  const today = getLocalDateOnly()

  const loadSnapshot = useCallback(
    () => services.dashboard.getFinancialSnapshot.execute(),
    [services],
  )
  const loadBudget = useCallback(
    () =>
      activePeriod
        ? services.dashboard.getBudgetSummary.execute(activePeriod, today)
        : Promise.resolve(null),
    [activePeriod, services, today],
  )
  const loadCategoryBudgets = useCallback(
    () =>
      activePeriod
        ? services.budgets.getCategoryBudgetSummaries.execute({
            ownerId: services.ownerId,
            periodId: activePeriod.id,
          })
        : Promise.resolve([]),
    [activePeriod, services],
  )
  const loadCategories = useCallback(
    () => services.categories.listCategories.execute(),
    [services],
  )
  const loadIncomes = useCallback(
    () =>
      activePeriod
        ? services.incomes.listIncomesByPeriod.execute(activePeriod.id)
        : Promise.resolve([]),
    [activePeriod, services],
  )
  const loadExpenses = useCallback(
    () =>
      activePeriod
        ? services.expenses.listExpensesByPeriod.execute(activePeriod.id)
        : Promise.resolve([]),
    [activePeriod, services],
  )
  const loadRecurring = useCallback(
    () =>
      services.recurringPayments.getOverview.execute(activePeriod?.id ?? null),
    [activePeriod, services],
  )

  const snapshot = useAsyncData(loadSnapshot)
  const budget = useAsyncData(loadBudget)
  const categoryBudgets = useAsyncData(loadCategoryBudgets)
  const categories = useAsyncData(loadCategories)
  const incomes = useAsyncData(loadIncomes)
  const expenses = useAsyncData(loadExpenses)
  const recurring = useAsyncData(loadRecurring)

  const categoryValues = categories.data ?? []
  const attentionItems = buildHomeAttentionItems({
    snapshot: snapshot.data,
    budgetSummaries: categoryBudgets.data,
    categories: categoryValues,
    sync,
  })
  const attentionPending =
    (snapshot.status === 'loading' && !snapshot.data) ||
    (categoryBudgets.status === 'loading' && !categoryBudgets.data) ||
    (categories.status === 'loading' && !categories.data)
  const attentionIncomplete =
    snapshot.status === 'error' ||
    categoryBudgets.status === 'error' ||
    categories.status === 'error'

  const nextCommitment = recurring.data
    ? selectNextCommitment({
        ...recurring.data,
        categories: categoryValues,
        today,
      })
    : null
  const nextExpectedIncome = incomes.data
    ? selectNextExpectedIncome(incomes.data, today)
    : null
  const recentActivity =
    incomes.data || expenses.data
      ? selectRecentActivity({
          incomes: incomes.data ?? [],
          expenses: expenses.data ?? [],
          categories: categoryValues,
        })
      : []
  const primaryAction = snapshot.data
    ? selectHomePrimaryAction(snapshot.data)
    : null
  const periodLabel = activePeriod
    ? `${activePeriod.startDate} — ${activePeriod.endDate}`
    : 'Sin periodo seleccionado'

  return (
    <>
      <PageHeader
        eyebrow="Inicio"
        title="Tu panorama financiero"
        description={`Situación y proyección vigentes · Plan y actividad: ${periodLabel}`}
        actions={
          primaryAction && primaryAction.kind !== 'balance' ? (
            <Link
              className={`ln-button ln-button--primary ln-home-primary-action ln-home-primary-action--${primaryAction.kind}`}
              to={primaryAction.to}
            >
              {primaryAction.label}
            </Link>
          ) : undefined
        }
      />

      <section
        className="ln-home-section ln-home-situation"
        aria-labelledby="home-situation"
      >
        <SectionHeading
          id="home-situation"
          eyebrow="Hoy"
          title="Situación actual"
          description="Tu posición financiera global, independiente del periodo seleccionado para explorar el plan."
        />
        {snapshot.status === 'loading' && !snapshot.data ? (
          <Surface>
            <LoadingState
              variant="skeleton"
              message="Cargando tu situación actual…"
            />
          </Surface>
        ) : null}
        {snapshot.status === 'error' ? (
          <ErrorState
            title="No pudimos cargar tu situación actual"
            message="No mostraremos un saldo aproximado ni lo sustituiremos por cero."
            onRetry={snapshot.refresh}
          />
        ) : null}
        {snapshot.data ? <Situation snapshot={snapshot.data} /> : null}
      </section>

      {attentionItems.length || attentionPending || attentionIncomplete ? (
        <section
          className="ln-home-section ln-home-attention"
          aria-labelledby="home-attention"
        >
          <SectionHeading
            id="home-attention"
            eyebrow="Prioridad"
            title="Necesita atención"
            description="Sólo mostramos asuntos con una acción clara, en orden de prioridad."
          />
          {attentionPending && attentionItems.length === 0 ? (
            <LoadingState
              variant="skeleton"
              message="Comprobando asuntos pendientes…"
            />
          ) : null}
          {attentionIncomplete ? (
            <Notice
              tone="warning"
              title="Revisión parcial"
              message="Algunas fuentes no respondieron. Los asuntos visibles conservan su autoridad, pero la revisión puede estar incompleta."
              action={
                <button
                  type="button"
                  className="ln-button ln-button--secondary"
                  onClick={() => {
                    if (snapshot.status === 'error') snapshot.refresh()
                    if (categoryBudgets.status === 'error')
                      categoryBudgets.refresh()
                    if (categories.status === 'error') categories.refresh()
                  }}
                >
                  Reintentar revisión
                </button>
              }
            />
          ) : null}
          <div className="ln-home-attention-list">
            {attentionItems.map((item) => (
              <AttentionItem
                key={attentionKey(item)}
                item={item}
                onRetrySync={() => void sync.syncNow()}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="ln-home-section ln-home-next"
        aria-labelledby="home-next"
      >
        <SectionHeading
          id="home-next"
          eyebrow="Periodo seleccionado"
          title="Qué viene después"
          description={`Próximos eventos dentro de ${periodLabel}. No representa una búsqueda owner-wide.`}
        />
        {(recurring.status === 'loading' && !recurring.data) ||
        (incomes.status === 'loading' && !incomes.data) ? (
          <LoadingState
            variant="skeleton"
            message="Buscando los próximos eventos…"
          />
        ) : null}
        {recurring.status === 'error' || incomes.status === 'error' ? (
          <Notice
            tone="warning"
            title="Próximos eventos parciales"
            message="Mostramos las fuentes disponibles; otra parte no pudo cargarse."
            action={
              <button
                type="button"
                className="ln-button ln-button--secondary"
                onClick={() => {
                  if (recurring.status === 'error') recurring.refresh()
                  if (incomes.status === 'error') incomes.refresh()
                }}
              >
                Reintentar eventos
              </button>
            }
          />
        ) : null}
        {nextCommitment || nextExpectedIncome ? (
          <Surface className="ln-home-next-list">
            {nextCommitment ? (
              <InteractiveRow
                leading={<CalendarClock />}
                action={
                  <Link
                    className="ln-row-link"
                    to={nextCommitment.navigationTarget}
                    aria-label={`Abrir compromiso ${nextCommitment.planName}`}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Link>
                }
                className="ln-home-event ln-home-event--commitment"
              >
                <div className="ln-home-event__main">
                  <div>
                    <span className="ln-status-label ln-status-label--upcoming">
                      Próximo compromiso
                    </span>
                    <h3>{nextCommitment.planName}</h3>
                    <p>
                      {nextCommitment.dateContext} ·{' '}
                      {nextCommitment.categoryName}
                    </p>
                  </div>
                  <strong>
                    {nextCommitment.amountCents === null ? (
                      'Monto no disponible'
                    ) : (
                      <MoneyDisplay amount={nextCommitment.amountCents} />
                    )}
                  </strong>
                </div>
              </InteractiveRow>
            ) : null}
            {nextExpectedIncome ? (
              <InteractiveRow
                leading={<BanknoteArrowUp />}
                action={
                  nextExpectedIncome.navigationTarget ? (
                    <Link
                      className="ln-row-link"
                      to={nextExpectedIncome.navigationTarget}
                      aria-label={`Abrir ingreso esperado ${nextExpectedIncome.description}`}
                    >
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  ) : undefined
                }
                className="ln-home-event ln-home-event--expected"
              >
                <div className="ln-home-event__main">
                  <div>
                    <span className="ln-status-label ln-status-label--expected">
                      Ingreso esperado
                    </span>
                    <h3>{nextExpectedIncome.description}</h3>
                    <p>
                      {formatHomeEventDate(nextExpectedIncome.date, today)} ·
                      Dinero futuro, todavía no disponible
                    </p>
                  </div>
                  <strong>
                    <MoneyDisplay amount={nextExpectedIncome.amountCents} />
                  </strong>
                </div>
              </InteractiveRow>
            ) : null}
          </Surface>
        ) : recurring.status === 'success' && incomes.status === 'success' ? (
          <Surface variant="subtle" className="ln-home-empty-inline">
            No hay próximos compromisos ni ingresos esperados en este periodo.
          </Surface>
        ) : null}
      </section>

      <section
        className="ln-home-section ln-home-plan"
        aria-labelledby="home-plan"
      >
        <SectionHeading
          id="home-plan"
          eyebrow="Plan"
          title="Resumen del plan"
          description="La proyección usa el periodo vigente resuelto por FinancialSnapshot; el presupuesto usa el periodo seleccionado indicado aparte."
        />
        <Surface className="ln-home-plan-surface">
          <div className="ln-home-plan-group">
            <div className="ln-home-plan-group__heading">
              <TrendingUp aria-hidden="true" />
              <div>
                <h3>Proyección vigente</h3>
                <p>Autoridad: FinancialSnapshot.</p>
              </div>
            </div>
            {snapshot.status === 'loading' && !snapshot.data ? (
              <LoadingState
                variant="skeleton"
                message="Cargando la proyección…"
              />
            ) : null}
            {snapshot.status === 'error' ? (
              <ErrorState
                title="No pudimos cargar la proyección"
                message="Disponible y cierre permanecen sin sustituirse por cero."
                onRetry={snapshot.refresh}
              />
            ) : null}
            {snapshot.data ? (
              <ProjectionSummary snapshot={snapshot.data} />
            ) : null}
          </div>

          <div className="ln-home-plan-group">
            <div className="ln-home-plan-group__heading">
              <WalletCards aria-hidden="true" />
              <div>
                <h3>Presupuesto del periodo seleccionado</h3>
                <p>{periodLabel}</p>
              </div>
            </div>
            {budget.status === 'loading' && !budget.data ? (
              <LoadingState
                variant="skeleton"
                message="Cargando el presupuesto…"
              />
            ) : null}
            {budget.status === 'error' ? (
              <ErrorState
                title="No pudimos cargar el resumen de presupuesto"
                message="La proyección visible no depende de este error."
                onRetry={budget.refresh}
              />
            ) : null}
            {budget.data ? (
              <>
                {budget.data.configuredBudgetCount > 0 ? (
                  <div className="ln-home-budget-metrics">
                    <MetricBlock
                      label="Total planeado"
                      value={<MoneyDisplay amount={budget.data.totalBudget} />}
                      supporting="Presupuesto agregado del periodo seleccionado."
                    />
                    <MetricBlock
                      label="Restante del presupuesto"
                      value={
                        <MoneyDisplay amount={budget.data.budgetRemaining} />
                      }
                      supporting="Resultado agregado autoritativo."
                      state={projectionMetricState(budget.data.budgetRemaining)}
                    />
                  </div>
                ) : null}
                {budget.data.configuredBudgetCount > 0 ? (
                  <HomeUsageProgress mode="budget" facts={budget.data} />
                ) : snapshot.status === 'loading' && !snapshot.data ? (
                  <LoadingState
                    variant="skeleton"
                    message="Cargando el uso de tus recursos…"
                  />
                ) : snapshot.status === 'error' ? (
                  <ErrorState
                    title="No pudimos cargar el uso de tus recursos"
                    message="El resto de Inicio permanece disponible."
                    onRetry={snapshot.refresh}
                  />
                ) : snapshot.data?.resourceUsage ? (
                  <HomeUsageProgress
                    mode="resources"
                    facts={snapshot.data.resourceUsage}
                  />
                ) : snapshot.data ? (
                  <HomeUsageProgress mode="unknown" />
                ) : null}
              </>
            ) : null}
            {categoryBudgets.data?.some(({ status }) => status === 'over') ? (
              <p className="ln-home-budget-risk">
                <CircleAlert aria-hidden="true" /> Hay presupuestos de categoría
                excedidos en este periodo.
              </p>
            ) : null}
          </div>

          <nav className="ln-home-plan-links" aria-label="Destinos del plan">
            <Link
              className="ln-button ln-button--secondary ln-home-navigation-action"
              to="/plan/proyeccion"
            >
              Ver proyección
            </Link>
            <Link
              className="ln-button ln-button--secondary ln-home-navigation-action"
              to="/plan/presupuestos"
            >
              Ver presupuestos
            </Link>
            <Link
              className="ln-button ln-button--secondary ln-home-navigation-action"
              to="/plan/compromisos"
            >
              Ver compromisos
            </Link>
          </nav>
        </Surface>
      </section>

      <section
        className="ln-home-section ln-home-activity"
        aria-labelledby="home-activity"
      >
        <SectionHeading
          id="home-activity"
          eyebrow="Periodo seleccionado"
          title="Actividad reciente"
          description="Gastos e ingresos recibidos efectivos. Las expectativas permanecen en planificación."
        />
        {(incomes.status === 'loading' && !incomes.data) ||
        (expenses.status === 'loading' && !expenses.data) ||
        (categories.status === 'loading' && !categories.data) ? (
          <LoadingState
            variant="skeleton"
            message="Cargando actividad reciente…"
          />
        ) : null}
        {incomes.status === 'error' ||
        expenses.status === 'error' ||
        categories.status === 'error' ? (
          <Notice
            tone="warning"
            title="Actividad parcial"
            message="Una fuente no respondió. No ocultamos las fuentes efectivas que sí están disponibles."
            action={
              <button
                type="button"
                className="ln-button ln-button--secondary"
                onClick={() => {
                  if (incomes.status === 'error') incomes.refresh()
                  if (expenses.status === 'error') expenses.refresh()
                  if (categories.status === 'error') categories.refresh()
                }}
              >
                Reintentar actividad
              </button>
            }
          />
        ) : null}
        {recentActivity.length ? (
          <Surface className="ln-home-activity-list">
            {recentActivity.map((movement) => (
              <HomeActivityRow
                key={`${movement.kind}:${movement.id}`}
                movement={movement}
              />
            ))}
          </Surface>
        ) : incomes.status === 'success' && expenses.status === 'success' ? (
          <Surface variant="subtle" className="ln-home-empty-inline">
            Aún no hay actividad efectiva en este periodo.
          </Surface>
        ) : null}
        <Link
          className="ln-button ln-button--secondary ln-home-navigation-action"
          to="/movimientos"
        >
          Ver todos los movimientos
        </Link>
      </section>
    </>
  )
}

function Situation({ snapshot }: { snapshot: FinancialSnapshot }) {
  const balance = snapshot.currentBalanceCents
  const unknown = balance === null
  return (
    <Surface
      className={`ln-home-situation-surface ${unknown ? 'ln-home-situation-surface--unknown' : ''}`.trim()}
    >
      <CircleDollarSign aria-hidden="true" />
      <div className="ln-home-situation-copy">
        {unknown ? <h3>Aún no conocemos tu saldo actual</h3> : null}
        <MetricBlock
          variant="primary"
          label="Saldo actual"
          value={balance === null ? '—' : <MoneyDisplay amount={balance} />}
          supporting={
            unknown
              ? 'Puedes registrar movimientos; las proyecciones dependientes del saldo permanecen no calculables.'
              : 'Saldo reconciliado con los movimientos efectivos conocidos.'
          }
          status={
            balance === null
              ? 'Aún sin saldo'
              : balance < 0
                ? 'Saldo negativo'
                : undefined
          }
          state={projectionMetricState(balance)}
        />
      </div>
      {unknown ? (
        <Link
          className="ln-button ln-button--primary"
          to="/saldo/inicial"
          state={{ from: '/inicio' }}
        >
          Indicar mi saldo actual
        </Link>
      ) : null}
    </Surface>
  )
}

function ProjectionSummary({ snapshot }: { snapshot: FinancialSnapshot }) {
  const coverage = projectionCoverageViewModel(snapshot.projectionCoverage)
  return (
    <>
      <div className="ln-home-projection-metrics">
        <MetricBlock
          variant="primary"
          label="Disponible después de compromisos"
          value={<FinancialValue amount={snapshot.projectedAvailableCents} />}
          supporting="No incluye ingresos que todavía no recibes."
          state={projectionMetricState(snapshot.projectedAvailableCents)}
          status={
            snapshot.projectedAvailableCents !== null &&
            snapshot.projectedAvailableCents < 0
              ? 'Disponible proyectado negativo'
              : undefined
          }
        />
        <MetricBlock
          variant="primary"
          label="Saldo estimado al cierre"
          value={
            <FinancialValue amount={snapshot.projectedClosingBalanceCents} />
          }
          supporting="Estimación futura si se cumplen los factores incluidos."
          state={projectionMetricState(snapshot.projectedClosingBalanceCents)}
          status="Estimado"
        />
        <MetricBlock
          label="Ingresos esperados incluidos"
          value={
            snapshot.expectedIncomeCents === 0 ? (
              'Sin ingresos esperados'
            ) : (
              <MoneyDisplay amount={snapshot.expectedIncomeCents} />
            )
          }
          supporting="Dinero futuro, no saldo actual."
        />
        <MetricBlock
          label="Compromisos incluidos"
          value={<MoneyDisplay amount={snapshot.committedCents} />}
          supporting="Importe pendiente dentro de la cobertura actual."
        />
      </div>
      <div className="ln-home-projection-scope">
        <strong>{projectionHorizonLabel(snapshot)}</strong>
        <span>{coverage.label}</span>
        <p>{coverage.description}</p>
      </div>
    </>
  )
}

function AttentionItem({
  item,
  onRetrySync,
}: {
  item: HomeAttentionItem
  onRetrySync(): void
}) {
  if (item.kind === 'overdue-commitments')
    return (
      <AttentionBlock
        tone="danger"
        heading="Compromisos vencidos"
        headingLevel={3}
        action={
          <Link
            className="ln-button ln-button--secondary"
            to="/plan/compromisos"
          >
            Revisar compromisos
          </Link>
        }
      >
        <p className="ln-home-attention-copy">
          <CircleAlert aria-hidden="true" />
          <span>
            Tienes compromisos vencidos por{' '}
            <MoneyDisplay amount={item.amountCents} />. Es un total owner-wide;
            no inventamos filas de otros periodos.
          </span>
        </p>
      </AttentionBlock>
    )
  if (item.kind === 'overdue-expected-income')
    return (
      <AttentionBlock
        tone="warning"
        heading="Ingresos esperados vencidos"
        headingLevel={3}
        action={
          <Link
            className="ln-button ln-button--secondary"
            to="/movimientos?tipo=ingresos&estado=esperados"
          >
            Revisar ingresos esperados
          </Link>
        }
      >
        <p className="ln-home-attention-copy">
          <BanknoteArrowUp aria-hidden="true" />
          <span>
            Hay ingresos esperados vencidos por{' '}
            <MoneyDisplay amount={item.amountCents} />. Siguen siendo dinero
            futuro, no saldo disponible.
          </span>
        </p>
      </AttentionBlock>
    )
  if (item.kind === 'budget-over')
    return (
      <AttentionBlock
        tone="warning"
        heading={`Presupuesto excedido: ${item.categoryName}`}
        headingLevel={3}
        action={
          <Link
            className="ln-button ln-button--secondary"
            to="/plan/presupuestos"
          >
            Ver presupuestos
          </Link>
        }
      >
        <p className="ln-home-attention-copy">
          <WalletCards aria-hidden="true" />
          <span>
            El estado autoritativo de esta categoría es excedido en el periodo
            seleccionado.
          </span>
        </p>
      </AttentionBlock>
    )
  return (
    <AttentionBlock
      tone="warning"
      heading="La sincronización necesita revisión"
      headingLevel={3}
      action={
        <button
          type="button"
          className="ln-button ln-button--secondary"
          onClick={onRetrySync}
        >
          Reintentar sincronización
        </button>
      }
    >
      <p className="ln-home-attention-copy">
        <RefreshCw aria-hidden="true" />
        <span>{item.message}</span>
      </p>
    </AttentionBlock>
  )
}

function HomeActivityRow({ movement }: { movement: MovementListItem }) {
  const expense = movement.kind === 'expense'
  return (
    <InteractiveRow
      leading={expense ? <BanknoteArrowDown /> : <BanknoteArrowUp />}
      className={`ln-home-activity-row ln-home-activity-row--${movement.kind}`}
    >
      <div className="ln-home-activity-row__main">
        <div>
          <h3>{movement.description}</h3>
          <p>
            {formatCompactDate(movement.date)} · {movement.categoryOrOrigin}
          </p>
        </div>
        <div>
          <MoneyDisplay amount={movement.amountCents} />
          <span className={`ln-status-label ln-status-label--${movement.kind}`}>
            {movement.statusLabel}
          </span>
        </div>
      </div>
    </InteractiveRow>
  )
}

function attentionKey(item: HomeAttentionItem): string {
  return item.kind === 'budget-over'
    ? `${item.kind}:${item.categoryId}`
    : item.kind
}
