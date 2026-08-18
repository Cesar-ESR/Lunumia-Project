import type { AmountCents, SignedMoneyCents } from '@domain/value-objects'

export type FinancialAffordability = 'unknown' | 'within' | 'exceeds'
export type BudgetFit = 'not_configured' | 'within' | 'exceeds'

export interface SimulationResult {
  projectedAvailableBeforePurchase: SignedMoneyCents | null
  projectedAvailableAfterPurchase: SignedMoneyCents | null
  financialAffordability: FinancialAffordability
  categoryBudgetBefore: SignedMoneyCents | null
  categoryBudgetAfter: SignedMoneyCents | null
  budgetFit: BudgetFit
}

export function simulatePurchaseImpact(input: {
  projectedAvailableCents: SignedMoneyCents | null
  purchaseAmountCents: AmountCents
  categoryBudgetRemainingCents: SignedMoneyCents | null
}): SimulationResult {
  const projectedAvailableAfterPurchase =
    input.projectedAvailableCents === null
      ? null
      : input.projectedAvailableCents - input.purchaseAmountCents
  const categoryBudgetAfter =
    input.categoryBudgetRemainingCents === null
      ? null
      : input.categoryBudgetRemainingCents - input.purchaseAmountCents

  return {
    projectedAvailableBeforePurchase: input.projectedAvailableCents,
    projectedAvailableAfterPurchase,
    financialAffordability:
      projectedAvailableAfterPurchase === null
        ? 'unknown'
        : projectedAvailableAfterPurchase < 0
          ? 'exceeds'
          : 'within',
    categoryBudgetBefore: input.categoryBudgetRemainingCents,
    categoryBudgetAfter,
    budgetFit:
      categoryBudgetAfter === null
        ? 'not_configured'
        : categoryBudgetAfter < 0
          ? 'exceeds'
          : 'within',
  }
}
