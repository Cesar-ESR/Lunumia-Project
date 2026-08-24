import { useCallback, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAuth } from '../context/AuthContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAIAvailability } from '../hooks/useAIAvailability'
import { useCategoryChangeExplanations } from '../hooks/useCategoryChangeExplanations'
import { formatCompactDate } from '../utils/movement-view-model'

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

  const comparisonPeriod = comparisonPeriods.find(
    ({ id }) => id === comparisonPeriodId,
  )
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
          eyebrow="Herramientas"
          title="Análisis"
          description="Compara actividad histórica calculada por Lunumia."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo seleccionado para analizar su actividad."
        />
      </>
    )

  const periodDescription = `${formatCompactDate(activePeriod.startDate)} — ${formatCompactDate(activePeriod.endDate)}`

  return (
    <>
      <PageHeader
        eyebrow="Herramientas"
        title="Análisis"
        description={`Periodo analizado: ${periodDescription}`}
        actions={
          comparisonPeriods.length ? (
            <label className="compact-field ln-analysis-period-selector">
              <span>Comparar con</span>
              <select
                value={comparisonPeriodId}
                onChange={(event) => setComparisonPeriodId(event.target.value)}
              >
                {comparisonPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {formatCompactDate(period.startDate)} —{' '}
                    {formatCompactDate(period.endDate)}
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
        <LoadingState variant="skeleton" message="Calculando la comparación…" />
      ) : null}
      {changesState.status === 'error' ? (
        <ErrorState
          title="No pudimos calcular la comparación"
          message={changesState.error.message}
          onRetry={changesState.refresh}
        />
      ) : null}
      {comparisonPeriods.length > 0 &&
      changesState.status === 'success' &&
      changes.length === 0 ? (
        <EmptyState
          title="Aún no hay suficiente actividad para analizar este periodo"
          description="Registra gastos en alguno de los periodos para ver cambios. No solicitaremos una explicación con un conjunto vacío."
        />
      ) : null}

      {changes.length ? (
        <div className="ln-analysis-flow">
          <section aria-labelledby="analysis-facts-title">
            <div className="ln-section-heading">
              <div>
                <p className="eyebrow">Datos de Lunumia</p>
                <h2 id="analysis-facts-title">Cambios calculados</h2>
                <p>
                  Comparación con{' '}
                  {comparisonPeriod
                    ? `${formatCompactDate(comparisonPeriod.startDate)} — ${formatCompactDate(comparisonPeriod.endDate)}`
                    : 'el periodo de referencia'}
                  .
                </p>
              </div>
            </div>
            <div className="ln-analysis-facts-grid">
              {changes.map((change) => (
                <Surface
                  as="article"
                  className="ln-analysis-fact"
                  key={change.categoryId}
                >
                  <h3>{change.categoryName}</h3>
                  <dl>
                    <div>
                      <dt>Periodo analizado</dt>
                      <dd>
                        <MoneyDisplay amount={change.currentAmount} />
                      </dd>
                    </div>
                    <div>
                      <dt>Periodo comparado</dt>
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
                </Surface>
              ))}
            </div>
          </section>

          <Surface
            className="ln-analysis-ai"
            aria-labelledby="analysis-ai-title"
            aria-busy={ai.status === 'loading'}
          >
            <div className="ln-analysis-ai__heading">
              <Sparkles aria-hidden="true" />
              <div>
                <p className="eyebrow">Contenido opcional</p>
                <h2 id="analysis-ai-title">Explicación con IA</h2>
              </div>
            </div>
            <p>
              Esta explicación no modifica tus datos ni sustituye tus
              decisiones.
            </p>
            <p className="ln-analysis-ai__privacy">
              Para generarla se envía un resumen de los datos necesarios a un
              servicio remoto.
            </p>
            {canUseAI ? (
              <Button
                variant="secondary"
                loading={ai.status === 'loading'}
                loadingLabel="Generando explicación…"
                onClick={() => void ai.generate()}
              >
                {ai.status === 'success'
                  ? 'Generar de nuevo'
                  : 'Solicitar explicación'}
              </Button>
            ) : (
              <Notice
                tone="info"
                message="La explicación con IA requiere una cuenta con sesión y conexión. Los datos calculados permanecen disponibles."
              />
            )}
            {ai.status === 'loading' ? (
              <LoadingState message="Generando únicamente la explicación…" />
            ) : null}
            {ai.message ? (
              <Notice
                tone="warning"
                title="No pudimos generar la explicación"
                message={ai.message}
                action={
                  ai.status !== 'rate_limited' ? (
                    <Button
                      variant="secondary"
                      onClick={() => void ai.generate()}
                    >
                      Reintentar explicación
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
            {ai.status === 'success' ? (
              <div
                className="ln-analysis-ai-results"
                aria-label="Contenido generado por IA"
              >
                {changes.map((change) => (
                  <article key={change.categoryId}>
                    <h3>{change.categoryName}</h3>
                    <p>
                      {ai.explanations.get(change.categoryId) ??
                        'No se recibió una explicación para esta categoría.'}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </Surface>
        </div>
      ) : null}
    </>
  )
}
