import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { FinancialSnapshot } from '@domain/calculations'
import { Button } from './Button'
import { LoadingState } from './LoadingState'
import { Notice } from './Notice'
import { Surface } from './Surface'
import {
  usePlanningAnalysis,
  type ExplainPlanningAction,
} from '../hooks/usePlanningAnalysis'

export function PlanningAISection({
  action,
  snapshot,
  canUseAI,
}: {
  action: ExplainPlanningAction | null
  snapshot: FinancialSnapshot
  canUseAI: boolean
}) {
  const ai = usePlanningAnalysis({
    action,
    snapshot,
    enabled: canUseAI,
  })
  const incompleteBalance = snapshot.currentBalanceCents === null
  const canRequest = ai.eligible && canUseAI && action !== null

  return (
    <Surface
      className="ln-analysis-ai ln-projection-ai"
      aria-labelledby="projection-ai-title"
      aria-busy={ai.status === 'loading'}
    >
      <div className="ln-analysis-ai__heading">
        <Sparkles aria-hidden="true" />
        <div>
          <p className="eyebrow">Contenido opcional</p>
          <h2 id="projection-ai-title">Explicación con IA</h2>
        </div>
      </div>
      <p>Esta explicación no modifica tus datos ni sustituye tus decisiones.</p>
      <p className="ln-analysis-ai__privacy">
        Para generar esta explicación se envía un resumen de los datos
        necesarios a un servicio remoto.
      </p>

      {!ai.eligible ? (
        <div className="ln-projection-ai__eligibility">
          <Button variant="secondary" disabled>
            Ayúdame a interpretar este plan
          </Button>
          <Notice
            tone="info"
            title={
              incompleteBalance
                ? 'Primero necesitamos conocer tu saldo actual'
                : 'Aún no podemos interpretar esta proyección'
            }
            message={
              incompleteBalance
                ? 'Para interpretar esta proyección primero necesitamos conocer tu saldo actual.'
                : 'Necesitamos una proyección calculable y un horizonte vigente antes de solicitar la explicación.'
            }
            action={
              incompleteBalance ? (
                <Link
                  className="ln-button ln-button--secondary"
                  to="/saldo/inicial"
                  state={{ from: '/plan/proyeccion' }}
                >
                  Indicar saldo actual
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : canRequest ? (
        <Button
          variant="secondary"
          loading={ai.status === 'loading'}
          loadingLabel="Interpretando tu proyección…"
          onClick={() => void ai.generate()}
        >
          {ai.status === 'success'
            ? 'Interpretar de nuevo'
            : 'Ayúdame a interpretar este plan'}
        </Button>
      ) : (
        <Notice
          tone="info"
          message="La explicación con IA requiere una cuenta con sesión y conexión. Tu proyección calculada permanece disponible."
        />
      )}

      {ai.status === 'loading' ? (
        <LoadingState message="Generando únicamente la explicación…" />
      ) : null}

      {ai.message ? (
        <Notice
          tone="warning"
          role="alert"
          title="No pudimos generar la explicación"
          message={`${ai.message} Tu proyección permanece sin cambios.`}
          action={
            ai.status !== 'rate_limited' && canRequest ? (
              <Button variant="secondary" onClick={() => void ai.generate()}>
                Reintentar explicación
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {ai.status === 'success' && ai.response ? (
        <div
          className="ln-analysis-ai-results ln-projection-ai-results"
          aria-label="Explicación generada por IA"
        >
          <div>
            <h3>Resumen</h3>
            <p>{ai.response.summary}</p>
          </div>
          {ai.response.observations.length ? (
            <div>
              <h3>Lo que influye en tu proyección</h3>
              <ul>
                {ai.response.observations.map((observation, index) => (
                  <li key={`${index}:${observation}`}>{observation}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {ai.response.considerations.length ? (
            <div>
              <h3>Aspectos a considerar</h3>
              <ul>
                {ai.response.considerations.map((consideration, index) => (
                  <li key={`${index}:${consideration}`}>{consideration}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {ai.status === 'success' ? (
        <p className="sr-only" role="status" aria-live="polite">
          La explicación está lista.
        </p>
      ) : null}
    </Surface>
  )
}
