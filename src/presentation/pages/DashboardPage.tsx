import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardBudgetSummary } from '@application/use-cases/dashboard/GetDashboardBudgetSummary'
import { getLocalDateOnly } from '@shared/utils/date'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PeriodAISummary } from '../components/PeriodAISummary'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAuth } from '../context/AuthContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAIAvailability } from '../hooks/useAIAvailability'
import { usePeriodSummary } from '../hooks/usePeriodSummary'

function FinancialCard({
  title,
  amount,
  description,
}: {
  title: string
  amount: number | null
  description: string
}) {
  return (
    <article
      className={`financial-card ${amount !== null && amount < 0 ? 'negative-value' : ''}`}
    >
      <span>{title}</span>
      {amount === null ? (
        <strong>No configurado</strong>
      ) : (
        <MoneyDisplay amount={amount} />
      )}
      <p>
        {description}
        {amount !== null && amount < 0 ? ' Valor negativo.' : ''}
      </p>
    </article>
  )
}

const paceCopy: Record<
  DashboardBudgetSummary['spendingPace']['pace'],
  { label: string; description: string }
> = {
  low: {
    label: 'Bajo',
    description: 'Has gastado menos proporción que el tiempo transcurrido.',
  },
  adequate: {
    label: 'Adecuado',
    description: 'Tu gasto avanza cerca del ritmo esperado para el periodo.',
  },
  high: {
    label: 'Alto',
    description: 'Tus gastos avanzan más rápido que el tiempo del periodo.',
  },
  indeterminate: {
    label: 'Indeterminado',
    description: 'Asigna presupuesto para calcular el ritmo de gasto.',
  },
}

export function DashboardPage() {
  const services = useApplicationServices()
  const auth = useAuth()
  const canUseAI = useAIAvailability(Boolean(services.aiInsights))
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    const financial = services.dashboard.getFinancialSnapshot.execute()
    if (!activePeriod)
      return { financial: await financial, budget: null, aggregated: null }
    const [snapshot, budget, aggregated] = await Promise.all([
      financial,
      services.dashboard.getBudgetSummary.execute(
        activePeriod,
        getLocalDateOnly(),
      ),
      services.aiData.preparePeriodSummary.execute(activePeriod),
    ])
    return { financial: snapshot, budget, aggregated }
  }, [activePeriod, services])
  const summary = useAsyncData(load)
  const aiSummary = usePeriodSummary({
    action: services.aiInsights?.generatePeriodSummary ?? null,
    data: summary.data?.aggregated ?? null,
    enabled: canUseAI,
    identityKey: `${auth.ownerId}:${auth.user?.id ?? 'guest'}`,
    periodId: activePeriod?.id ?? null,
  })
  if (summary.status === 'loading' && !summary.data)
    return (
      <>
        <PageHeader
          eyebrow="Resumen"
          title="Tu panorama financiero"
          description={
            activePeriod
              ? `${activePeriod.startDate} — ${activePeriod.endDate}`
              : 'Estado financiero actual'
          }
        />
        <LoadingState message="Calculando tu panorama…" />
      </>
    )
  if (summary.status === 'error')
    return (
      <>
        <PageHeader eyebrow="Resumen" title="Tu panorama financiero" />
        <ErrorState message={summary.error.message} onRetry={summary.refresh} />
      </>
    )
  if (!summary.data) return null
  const financial = summary.data.financial
  const budget = summary.data.budget
  const pace = budget ? paceCopy[budget.spendingPace.pace] : null
  return (
    <>
      <PageHeader
        eyebrow="Resumen"
        title="Tu panorama financiero"
        description={
          activePeriod
            ? `${activePeriod.startDate} — ${activePeriod.endDate}`
            : 'Estado financiero actual'
        }
        actions={
          <Link className="button" to="/expenses">
            Registrar gasto
          </Link>
        }
      />
      {budget?.spendingPace.pace === 'high' ? (
        <Notice
          tone="error"
          message="Tu ritmo de gasto es alto. Revisa tus gastos y presupuestos para evitar quedarte corto antes de terminar el periodo."
        />
      ) : null}
      <section className="financial-grid" aria-label="Resumen financiero">
        <FinancialCard
          title="Saldo actual"
          amount={financial.currentBalanceCents}
          description="Saldo reconciliado con movimientos efectivos."
        />
        {budget ? (
          <FinancialCard
            title="Presupuesto restante"
            amount={budget.budgetRemaining}
            description={`De un total planeado de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(budget.totalBudget / 100)}.`}
          />
        ) : null}
        <FinancialCard
          title="Gastos del periodo"
          amount={financial.spentCents}
          description="Gastos registrados en el periodo actual."
        />
        <FinancialCard
          title="Compromisos pendientes"
          amount={financial.committedCents}
          description="Compromisos vencidos y próximos dentro del horizonte."
        />
        <FinancialCard
          title="Dinero disponible proyectado"
          amount={financial.projectedAvailableCents}
          description="Saldo actual después de compromisos pendientes."
        />
        {financial.upcomingCommittedCents > 0 ? (
          <FinancialCard
            title="Compromisos próximos"
            amount={financial.upcomingCommittedCents}
            description="Compromisos por vencer dentro del horizonte."
          />
        ) : null}
        {financial.overdueCommittedCents > 0 ? (
          <FinancialCard
            title="Compromisos vencidos"
            amount={financial.overdueCommittedCents}
            description="Compromisos pendientes con fecha anterior a hoy."
          />
        ) : null}
        {financial.expectedIncomeCents > 0 ? (
          <FinancialCard
            title="Ingresos esperados"
            amount={financial.expectedIncomeCents}
            description="Ingresos esperados dentro del horizonte actual."
          />
        ) : null}
        {financial.overdueExpectedIncomeCents > 0 ? (
          <FinancialCard
            title="Ingresos esperados vencidos"
            amount={financial.overdueExpectedIncomeCents}
            description="Ingresos esperados con fecha anterior a hoy."
          />
        ) : null}
      </section>
      {budget && pace ? (
        <section className={`panel pace-card pace-${budget.spendingPace.pace}`}>
          <div>
            <p className="eyebrow">Ritmo de gasto</p>
            <h2>{pace.label}</h2>
            <p>{pace.description}</p>
          </div>
          <div className="pace-metrics">
            <div>
              <span>Presupuesto gastado</span>
              <strong>{budget.spendingPace.spentPercentage.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Tiempo transcurrido</span>
              <strong>{budget.spendingPace.timePercentage.toFixed(1)}%</strong>
            </div>
          </div>
        </section>
      ) : null}
      <PeriodAISummary
        state={aiSummary}
        canUseAI={canUseAI}
        hasData={Boolean(
          summary.data.aggregated &&
          (summary.data.aggregated.totalIncome > 0 ||
            summary.data.aggregated.totalExpenses > 0),
        )}
        onGenerate={() => void aiSummary.generate()}
      />
    </>
  )
}
