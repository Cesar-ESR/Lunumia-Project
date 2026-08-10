import {
  computeBudgetRemaining,
  simulatePurchaseImpact,
} from '@domain/calculations'
import type { Period } from '@domain/entities'
import type {
  ICategoryBudgetRepository,
  IExpenseRepository,
} from '@domain/repositories'
import type { AmountCents, DateOnly } from '@domain/value-objects'
import { GetDashboardSummary } from '../dashboard/GetDashboardSummary'

export class SimulatePurchase {
  constructor(
    private readonly dashboard: GetDashboardSummary,
    private readonly budgets: ICategoryBudgetRepository,
    private readonly expenses: IExpenseRepository,
  ) {}
  async execute(input: {
    period: Period
    categoryId: string
    amount: AmountCents
    today: DateOnly
  }) {
    const [summary, budget, expenses] = await Promise.all([
      this.dashboard.execute(input.period, input.today),
      this.budgets.findByPeriodAndCategory(input.period.id, input.categoryId),
      this.expenses.findByPeriod(input.period.id),
    ])
    const before = budget ? computeBudgetRemaining(budget, expenses) : 0
    return {
      ...simulatePurchaseImpact(
        summary.realAvailableMoney,
        input.amount,
        before,
      ),
      categoryBudgetBefore: budget ? before : null,
      categoryBudgetAfter: budget ? before - input.amount : null,
    }
  }
}
