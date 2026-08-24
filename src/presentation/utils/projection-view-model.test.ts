import {
  projectionCoverageViewModel,
  projectionHorizonLabel,
  projectionMetricState,
} from './projection-view-model'

describe('projection view model', () => {
  it.each([
    [null, 'unknown'],
    [-1, 'negative'],
    [0, 'known'],
    [1, 'known'],
  ] as const)('mapea %s sin alterar el valor financiero', (value, state) => {
    expect(projectionMetricState(value)).toBe(state)
  })

  it('traduce cobertura completa sin exponer el enum', () => {
    const coverage = projectionCoverageViewModel('full_period')
    expect(coverage).toMatchObject({
      label: 'Periodo completo',
      limited: false,
    })
    expect(coverage.description).not.toContain('full_period')
  })

  it('traduce cobertura limitada con alcance exacto', () => {
    const coverage = projectionCoverageViewModel('overdue_only')
    expect(coverage).toMatchObject({
      label: 'Cobertura limitada',
      limited: true,
    })
    expect(coverage.description).toContain('Sólo incluye compromisos vencidos')
    expect(coverage.description).not.toContain('overdue_only')
  })

  it('formatea DateOnly sin transformación UTC y conserva horizonte desconocido', () => {
    expect(projectionHorizonLabel({ projectionHorizonEnd: '2026-08-31' })).toBe(
      'Proyección hasta 31 de agosto de 2026',
    )
    expect(projectionHorizonLabel({ projectionHorizonEnd: null })).toBe(
      'Sin horizonte de periodo vigente',
    )
  })
})
