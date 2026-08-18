import {
  computeBudgetRemaining,
  simulatePurchaseImpact,
} from '@domain/calculations'
import type { Period } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
} from '@domain/repositories'
import type { AmountCents } from '@domain/value-objects'
import type { GetFinancialSnapshot } from '../dashboard/GetFinancialSnapshot'

export class SimulatePurchase {
  constructor(
    private readonly financialSnapshot: Pick<GetFinancialSnapshot, 'execute'>,
    private readonly budgets: ICategoryBudgetRepository,
    private readonly expenses: IExpenseRepository,
  ) {}
  async execute(input: {
    period: Period
    categoryId: string
    amount: AmountCents
  }) {
    const [snapshot, budget, expenses] = await Promise.all([
      this.financialSnapshot.execute(),
      this.budgets.findByPeriodAndCategory(input.period.id, input.categoryId),
      this.expenses.findByPeriod(input.period.id),
    ])
    const categoryBudgetRemaining = budget
      ? computeBudgetRemaining(budget, expenses)
      : null
    return {
      ...simulatePurchaseImpact({
        projectedAvailableCents: snapshot.projectedAvailableCents,
        purchaseAmountCents: input.amount,
        categoryBudgetRemainingCents: categoryBudgetRemaining,
      }),
      projectionCoverage: snapshot.projectionCoverage,
      projectionHorizonEnd: snapshot.projectionHorizonEnd,
    }
  }
}
