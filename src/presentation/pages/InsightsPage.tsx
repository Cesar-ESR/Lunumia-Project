import { useCallback, useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { PageHeader } from '../components/PageHeader'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAuth } from '../context/AuthContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAIAvailability } from '../hooks/useAIAvailability'
import { useCategoryChangeExplanations } from '../hooks/useCategoryChangeExplanations'

export function InsightsPage() {
  const services = useApplicationServices()
  const auth = useAuth()
  const { activePeriod, periods } = usePeriod()
  const comparisonPeriods = useMemo(
    () => periods.filter((period) => period.id !== activePeriod?.id),
    [activePeriod?.id, periods],
  )
  const [selectedComparisonPeriodId, setComparisonPeriodId] = useState('')
  const comparisonPeriodId = useMemo(() => {
    if (
      selectedComparisonPeriodId &&
      comparisonPeriods.some(({ id }) => id === selectedComparisonPeriodId)
    )
      return selectedComparisonPeriodId
    const previous = comparisonPeriods
      .filter((period) => period.startDate < (activePeriod?.startDate ?? ''))
      .sort((left, right) => right.startDate.localeCompare(left.startDate))[0]
    return previous?.id ?? comparisonPeriods[0]?.id ?? ''
  }, [activePeriod?.startDate, comparisonPeriods, selectedComparisonPeriodId])

  const load = useCallback(async () => {
    if (!activePeriod || !comparisonPeriodId) return []
    return services.aiData.prepareCategoryChanges.execute(
      activePeriod.id,
      comparisonPeriodId,
    )
  }, [activePeriod, comparisonPeriodId, services])
  const changesState = useAsyncData(load)
  const changes = changesState.data ?? []
  const canUseAI = useAIAvailability(Boolean(services.aiInsights))
  const ai = useCategoryChangeExplanations({
    action: services.aiInsights?.explainCategoryChanges ?? null,
    changes,
    enabled: canUseAI,
    identityKey: `${auth.ownerId}:${auth.user?.id ?? 'guest'}`,
    comparisonKey: `${activePeriod?.id ?? ''}:${comparisonPeriodId}`,
  })

  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Comparación"
          title="Insights por categoría"
          description="Compara cifras calculadas localmente entre periodos."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo para comparar tus gastos."
        />
      </>
    )

  return (
    <>
      <PageHeader
        eyebrow="Comparación"
        title="Insights por categoría"
        description="Las cifras se calculan localmente; el texto inteligente es opcional."
        actions={
          comparisonPeriods.length ? (
            <label className="compact-field">
              <span>Comparar con</span>
              <select
                value={comparisonPeriodId}
                onChange={(event) => setComparisonPeriodId(event.target.value)}
              >
                {comparisonPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.startDate} — {period.endDate}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />
      {!comparisonPeriods.length ? (
        <EmptyState
          title="Falta otro periodo"
          description="Crea al menos dos periodos para comparar cambios por categoría."
        />
      ) : null}
      {changesState.status === 'loading' && !changesState.data ? (
        <LoadingState message="Calculando cambios localmente…" />
      ) : null}
      {changesState.status === 'error' ? (
        <ErrorState
          message={changesState.error.message}
          onRetry={changesState.refresh}
        />
      ) : null}
      {changesState.status === 'success' && changes.length === 0 ? (
        <EmptyState
          title="Sin movimientos para comparar"
          description="Registra gastos en alguno de los periodos para ver cambios."
        />
      ) : null}
      {changes.length ? (
        <section
          className="ai-insights-section"
          aria-labelledby="changes-title"
        >
          <div className="ai-section-header">
            <div>
              <p className="eyebrow">Cifras locales</p>
              <h2 id="changes-title">Cambios por categoría</h2>
            </div>
            {canUseAI ? (
              <button
                type="button"
                className="button secondary"
                disabled={ai.status === 'loading'}
                onClick={() => void ai.generate()}
              >
                {ai.status === 'loading'
                  ? 'Generando…'
                  : 'Generar explicaciones'}
              </button>
            ) : null}
          </div>
          {!canUseAI ? (
            <p className="ai-disclaimer">
              Las explicaciones inteligentes están disponibles al iniciar sesión
              y tener conexión. La comparación local sigue funcionando.
            </p>
          ) : (
            <p className="ai-disclaimer">
              Las explicaciones son texto generado y no constituyen asesoría
              financiera.
            </p>
          )}
          {ai.status === 'loading' ? (
            <p className="ai-loading" role="status">
              Generando únicamente el texto explicativo…
            </p>
          ) : null}
          {ai.message ? (
            <div className="ai-error" role="alert">
              <p>{ai.message}</p>
              {ai.status !== 'rate_limited' ? (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => void ai.generate()}
                >
                  Reintentar
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="insights-grid">
            {changes.map((change) => {
              const explanation = ai.explanations.get(change.categoryId)
              return (
                <article className="insight-card" key={change.categoryId}>
                  <h3>{change.categoryName}</h3>
                  <dl>
                    <div>
                      <dt>Periodo actual</dt>
                      <dd>
                        <MoneyDisplay amount={change.currentAmount} />
                      </dd>
                    </div>
                    <div>
                      <dt>Periodo anterior</dt>
                      <dd>
                        <MoneyDisplay amount={change.previousAmount} />
                      </dd>
                    </div>
                    <div>
                      <dt>Cambio absoluto</dt>
                      <dd>
                        <MoneyDisplay amount={change.absoluteChange} />
                      </dd>
                    </div>
                    <div>
                      <dt>Cambio porcentual</dt>
                      <dd>
                        {change.changePercentage === null
                          ? 'Sin referencia anterior'
                          : `${change.changePercentage > 0 ? '+' : ''}${change.changePercentage.toFixed(1)}%`}
                      </dd>
                    </div>
                  </dl>
                  <div className="ai-explanation">
                    <span className="ai-label">Explicación inteligente</span>
                    <p>
                      {explanation ??
                        (ai.status === 'success'
                          ? 'No se recibió una explicación para esta categoría.'
                          : 'Genera explicaciones si deseas contexto textual adicional.')}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </>
  )
}
