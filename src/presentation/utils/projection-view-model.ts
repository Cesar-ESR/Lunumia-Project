import type {
  FinancialSnapshot,
  ProjectionCoverage,
} from '@domain/calculations'
import { formatDetailDate } from './movement-view-model'

export type ProjectionMetricState = 'known' | 'unknown' | 'negative'

export interface ProjectionCoverageViewModel {
  label: string
  description: string
  limited: boolean
}

export function projectionMetricState(
  value: number | null,
): ProjectionMetricState {
  if (value === null) return 'unknown'
  return value < 0 ? 'negative' : 'known'
}

export function projectionCoverageViewModel(
  coverage: ProjectionCoverage,
): ProjectionCoverageViewModel {
  if (coverage === 'full_period')
    return {
      label: 'Periodo completo',
      description:
        'Incluye los compromisos pendientes y los ingresos esperados considerados para el periodo vigente.',
      limited: false,
    }
  return {
    label: 'Cobertura limitada',
    description:
      'Sólo incluye compromisos vencidos. Sin un periodo vigente no incorpora ingresos esperados ni compromisos futuros.',
    limited: true,
  }
}

export function projectionHorizonLabel(
  snapshot: Pick<FinancialSnapshot, 'projectionHorizonEnd'>,
): string {
  return snapshot.projectionHorizonEnd
    ? `Proyección hasta ${formatDetailDate(snapshot.projectionHorizonEnd)}`
    : 'Sin horizonte de periodo vigente'
}
