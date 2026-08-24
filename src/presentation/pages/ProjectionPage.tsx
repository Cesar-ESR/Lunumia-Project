import { useCallback } from 'react'
import {
  ArrowDownToLine,
  CalendarRange,
  CircleAlert,
  CircleDollarSign,
  Landmark,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { SignedMoneyCents } from '@domain/value-objects'
import { AttentionBlock } from '../components/AttentionBlock'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MetricBlock } from '../components/MetricBlock'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { PageHeader } from '../components/PageHeader'
import { PlanningAISection } from '../components/PlanningAISection'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAIAvailability } from '../hooks/useAIAvailability'
import {
  projectionCoverageViewModel,
  projectionHorizonLabel,
  projectionMetricState,
} from '../utils/projection-view-model'

function ProjectionMoney({ amount }: { amount: SignedMoneyCents | null }) {
  return amount === null ? 'No calculable' : <MoneyDisplay amount={amount} />
}

export function ProjectionPage() {
  const services = useApplicationServices()
  const load = useCallback(
    () => services.dashboard.getFinancialSnapshot.execute(),
    [services],
  )
  const snapshot = useAsyncData(load)
  const canUseAI = useAIAvailability(Boolean(services.aiInsights))

  if (snapshot.status === 'loading' && !snapshot.data)
    return (
      <>
        <PageHeader
          eyebrow="Plan"
          title="Proyección"
          description="Una lectura estimada basada en tu situación financiera actual."
        />
        <LoadingState message="Preparando los factores de tu proyección…" />
      </>
    )
  if (snapshot.status === 'error')
    return (
      <>
        <PageHeader eyebrow="Plan" title="Proyección" />
        <ErrorState
          message="No pudimos calcular tu proyección con los datos actuales."
          onRetry={snapshot.refresh}
        />
      </>
    )
  if (!snapshot.data) return null

  const financial = snapshot.data
  const coverage = projectionCoverageViewModel(financial.projectionCoverage)
  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Proyección"
        description="Se basa en el periodo vigente y en tu información financiera actual."
        actions={
          <Link className="ln-button ln-button--secondary" to="/simulador">
            Simular una compra
          </Link>
        }
      />

      {financial.currentBalanceCents === null ? (
        <AttentionBlock
          tone="info"
          heading="Necesitamos un saldo actual para proyectar"
          action={
            <Link
              className="ln-button ln-button--secondary"
              to="/saldo/inicial"
              state={{ from: '/plan/proyeccion' }}
            >
              Indicar mi saldo actual
            </Link>
          }
        >
          <p>
            Conservamos visibles los factores conocidos, pero el disponible y el
            cierre permanecen como no calculables.
          </p>
        </AttentionBlock>
      ) : null}

      <section
        className="ln-projection-flow"
        aria-label="Resultados de la proyección"
      >
        <Surface className="ln-projection-reference">
          <Landmark aria-hidden="true" />
          <MetricBlock
            label="Saldo actual de referencia"
            value={<ProjectionMoney amount={financial.currentBalanceCents} />}
            supporting="Saldo reconciliado con los movimientos efectivos conocidos."
            state={projectionMetricState(financial.currentBalanceCents)}
          />
        </Surface>

        <div className="ln-projection-arrow" aria-hidden="true">
          <ArrowDownToLine />
        </div>

        <div className="ln-projection-results">
          <Surface className="ln-projection-result ln-projection-result--available">
            <CircleDollarSign aria-hidden="true" />
            <MetricBlock
              variant="primary"
              label="Disponible después de compromisos"
              value={
                <ProjectionMoney amount={financial.projectedAvailableCents} />
              }
              supporting="Tu saldo actual menos los pagos pendientes incluidos en esta proyección. No cuenta ingresos que todavía no recibes."
              state={projectionMetricState(financial.projectedAvailableCents)}
            />
          </Surface>
          <Surface className="ln-projection-result ln-projection-result--closing">
            <TrendingUp aria-hidden="true" />
            <MetricBlock
              variant="primary"
              label="Saldo estimado al cierre"
              value={
                <ProjectionMoney
                  amount={financial.projectedClosingBalanceCents}
                />
              }
              supporting="Lo que podrías tener al terminar el horizonte si recibes los ingresos esperados y cumples los compromisos considerados."
              status="Estimado"
              state={projectionMetricState(
                financial.projectedClosingBalanceCents,
              )}
            />
          </Surface>
        </div>
      </section>

      <section
        className="ln-projection-section"
        aria-labelledby="projection-factors"
      >
        <div className="ln-section-heading">
          <div>
            <p className="eyebrow">Factores</p>
            <h2 id="projection-factors">Qué está incluido</h2>
            <p>
              Estos importes provienen directamente del snapshot financiero.
            </p>
          </div>
        </div>
        <Surface className="ln-projection-factors">
          <MetricBlock
            label="Ingresos esperados"
            value={<MoneyDisplay amount={financial.expectedIncomeCents} />}
            supporting="Dinero futuro que todavía no has recibido."
            className="ln-projection-factor--expected"
          />
          <MetricBlock
            label="Compromisos incluidos"
            value={<MoneyDisplay amount={financial.committedCents} />}
            supporting="Pagos pendientes considerados dentro de la cobertura actual."
            className="ln-projection-factor--planned"
          />
          {financial.overdueCommittedCents > 0 ? (
            <MetricBlock
              label="Compromisos vencidos, total general"
              value={<MoneyDisplay amount={financial.overdueCommittedCents} />}
              supporting="Total general de tus compromisos vencidos; no representa un listado detallado de otros periodos."
              className="ln-projection-factor--danger"
            />
          ) : null}
        </Surface>
        {financial.overdueExpectedIncomeCents > 0 ? (
          <AttentionBlock
            tone="warning"
            heading="También tienes ingresos esperados vencidos"
          >
            <p>
              El total general vencido es{' '}
              <MoneyDisplay amount={financial.overdueExpectedIncomeCents} />. No
              forma parte de los ingresos esperados incluidos en el cierre.
            </p>
          </AttentionBlock>
        ) : null}
      </section>

      <section
        className="ln-projection-section"
        aria-labelledby="projection-scope"
      >
        <div className="ln-section-heading">
          <div>
            <p className="eyebrow">Alcance</p>
            <h2 id="projection-scope">Horizonte y cobertura</h2>
          </div>
        </div>
        <Surface className="ln-projection-scope">
          <div className="ln-projection-scope__icon">
            <CalendarRange aria-hidden="true" />
          </div>
          <div>
            <strong>{projectionHorizonLabel(financial)}</strong>
            <span>{coverage.label}</span>
            <p>{coverage.description}</p>
          </div>
        </Surface>
        {coverage.limited ? (
          <AttentionBlock tone="warning" heading="Cobertura limitada">
            <p>{coverage.description}</p>
          </AttentionBlock>
        ) : null}
      </section>

      {financial.projectedAvailableCents !== null &&
      financial.projectedAvailableCents < 0 ? (
        <AttentionBlock
          tone="warning"
          heading="El disponible proyectado es negativo"
        >
          <p>
            El valor firmado se conserva porque es un resultado financiero
            válido, no un error ni un monto que deba reducirse a cero.
          </p>
        </AttentionBlock>
      ) : null}

      {financial.projectedClosingBalanceCents !== null &&
      financial.projectedClosingBalanceCents < 0 ? (
        <AttentionBlock tone="warning" heading="El cierre estimado es negativo">
          <p>
            Revisa los compromisos e ingresos esperados incluidos antes de tomar
            una decisión.
          </p>
        </AttentionBlock>
      ) : null}

      <PlanningAISection
        action={services.aiInsights?.explainPlanning ?? null}
        snapshot={financial}
        canUseAI={canUseAI}
      />

      {financial.overdueCommittedCents > 0 ? (
        <Link className="ln-inline-link" to="/plan/compromisos">
          <CircleAlert aria-hidden="true" /> Revisar compromisos
        </Link>
      ) : null}
    </>
  )
}
