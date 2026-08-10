import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardSummary } from '@application/use-cases/dashboard/GetDashboardSummary'
import { getLocalDateOnly } from '@shared/utils/date'
import { EmptyState } from '../components/EmptyState'
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
  amount: number
  description: string
}) {
  return (
    <article className={`financial-card ${amount < 0 ? 'negative-value' : ''}`}>
      <span>{title}</span>
      <MoneyDisplay amount={amount} />
      <p>
        {description}
        {amount < 0 ? ' Valor negativo.' : ''}
      </p>
    </article>
  )
}

const paceCopy: Record<
  DashboardSummary['spendingPace']['pace'],
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
    if (!activePeriod) return null
    const [financial, aggregated] = await Promise.all([
      services.dashboard.getSummary.execute(activePeriod, getLocalDateOnly()),
      services.aiData.preparePeriodSummary.execute(activePeriod),
    ])
    return { financial, aggregated }
  }, [activePeriod, services])
  const summary = useAsyncData(load)
  const aiSummary = usePeriodSummary({
    action: services.aiInsights?.generatePeriodSummary ?? null,
    data: summary.data?.aggregated ?? null,
    enabled: canUseAI,
    identityKey: `${auth.ownerId}:${auth.user?.id ?? 'guest'}`,
    periodId: activePeriod?.id ?? null,
  })
  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Resumen"
          title="Tu panorama financiero"
          description="Todo lo importante de tu periodo, en un solo lugar."
        />
        <EmptyState
          title="Aún no hay un periodo activo"
          description="Crea o selecciona un periodo para ver tu panorama financiero."
          action={
            <Link className="button" to="/periods">
              Configurar periodo
            </Link>
          }
        />
      </>
    )
  if (summary.status === 'loading' && !summary.data)
    return (
      <>
        <PageHeader
          eyebrow="Resumen"
          title="Tu panorama financiero"
          description={`${activePeriod.startDate} — ${activePeriod.endDate}`}
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
  const pace = paceCopy[financial.spendingPace.pace]
  return (
    <>
      <PageHeader
        eyebrow="Resumen"
        title="Tu panorama financiero"
        description={`${activePeriod.startDate} — ${activePeriod.endDate}`}
        actions={
          <Link className="button" to="/expenses">
            Registrar gasto
          </Link>
        }
      />
      {financial.spendingPace.pace === 'high' ? (
        <Notice
          tone="error"
          message="Tu ritmo de gasto es alto. Revisa tus gastos y presupuestos para evitar quedarte corto antes de terminar el periodo."
        />
      ) : null}
      <section className="financial-grid" aria-label="Resumen financiero">
        <FinancialCard
          title="Saldo actual"
          amount={financial.currentBalance}
          description="Ingresos menos gastos registrados."
        />
        <FinancialCard
          title="Presupuesto restante"
          amount={financial.budgetRemaining}
          description={`De un total planeado de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(financial.totalBudget / 100)}.`}
        />
        <FinancialCard
          title="Compromisos pendientes"
          amount={financial.pendingCommitments}
          description="Pagos recurrentes aún pendientes."
        />
        <FinancialCard
          title="Dinero disponible real"
          amount={financial.realAvailableMoney}
          description="Saldo actual menos compromisos pendientes."
        />
      </section>
      <section
        className={`panel pace-card pace-${financial.spendingPace.pace}`}
      >
        <div>
          <p className="eyebrow">Ritmo de gasto</p>
          <h2>{pace.label}</h2>
          <p>{pace.description}</p>
        </div>
        <div className="pace-metrics">
          <div>
            <span>Presupuesto gastado</span>
            <strong>
              {financial.spendingPace.spentPercentage.toFixed(1)}%
            </strong>
          </div>
          <div>
            <span>Tiempo transcurrido</span>
            <strong>{financial.spendingPace.timePercentage.toFixed(1)}%</strong>
          </div>
        </div>
      </section>
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
