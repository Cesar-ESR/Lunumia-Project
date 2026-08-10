import type { PeriodSummaryState } from '../hooks/usePeriodSummary'

export function PeriodAISummary({
  state,
  canUseAI,
  hasData,
  onGenerate,
}: {
  state: PeriodSummaryState
  canUseAI: boolean
  hasData: boolean
  onGenerate(): void
}) {
  return (
    <section className="panel ai-section" aria-labelledby="period-ai-title">
      <div className="ai-section-header">
        <div>
          <p className="eyebrow">Contenido opcional</p>
          <h2 id="period-ai-title">Resumen inteligente</h2>
        </div>
        {canUseAI && hasData ? (
          <button
            type="button"
            className="button secondary"
            disabled={state.status === 'loading'}
            onClick={onGenerate}
          >
            {state.status === 'loading'
              ? 'Generando…'
              : state.summary
                ? 'Regenerar resumen'
                : 'Generar resumen'}
          </button>
        ) : null}
      </div>
      <p className="ai-disclaimer">
        Este texto se genera a partir de los datos calculados de tu periodo. No
        es asesoría financiera.
      </p>
      {!hasData ? (
        <p>Registra movimientos para generar un resumen del periodo.</p>
      ) : !canUseAI ? (
        <p>
          El resumen inteligente está disponible al iniciar sesión y tener
          conexión.
        </p>
      ) : null}
      {state.status === 'loading' ? (
        <p className="ai-loading" role="status">
          Preparando el resumen… Tus cifras permanecen visibles.
        </p>
      ) : null}
      {state.message ? (
        <div className="ai-error" role="alert">
          <p>{state.message}</p>
          {state.status !== 'rate_limited' ? (
            <button type="button" className="button ghost" onClick={onGenerate}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}
      {state.summary ? (
        <div className="ai-generated-content">
          <span className="ai-label">Texto generado</span>
          <p>{state.summary.text}</p>
          {state.summary.highlights.length ? (
            <ul>
              {state.summary.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
