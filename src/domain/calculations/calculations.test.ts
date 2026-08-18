import { describe, expect, it } from 'vitest'
import {
  computeCategoryChangePercentage,
  computeSpendingPace,
  simulatePurchaseImpact,
} from './index'

describe('cálculos financieros', () => {
  it('no divide entre cero al calcular el ritmo', () =>
    expect(
      computeSpendingPace(0, 0, '2026-01-01', '2026-01-31', '2026-01-15').pace,
    ).toBe('indeterminate'))
  it('limita el porcentaje de tiempo en periodos futuros', () =>
    expect(
      computeSpendingPace(100, 0, '2026-02-01', '2026-02-28', '2026-01-01')
        .timePercentage,
    ).toBe(0))
  it('indica compras que dejan disponible negativo', () =>
    expect(
      simulatePurchaseImpact({
        projectedAvailableCents: 100,
        purchaseAmountCents: 101,
        categoryBudgetRemainingCents: 50,
      }).financialAffordability,
    ).toBe('exceeds'))
  it('retorna null cuando no hay periodo previo', () =>
    expect(computeCategoryChangePercentage(10, 0)).toBeNull())
})
