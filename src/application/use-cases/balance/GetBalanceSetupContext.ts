import { findEarliestBalanceEffectiveAt } from '@domain/calculations'
import type {
  IExpenseRepository,
  IIncomeRepository,
} from '@domain/repositories'

export interface BalanceSetupContext {
  hasEffectiveBalanceMovements: boolean
}

export class GetBalanceSetupContext {
  constructor(
    private readonly incomes: IIncomeRepository,
    private readonly expenses: IExpenseRepository,
  ) {}

  async execute(): Promise<BalanceSetupContext> {
    const [incomes, expenses] = await Promise.all([
      this.incomes.findAll(),
      this.expenses.findAll(),
    ])
    return {
      hasEffectiveBalanceMovements:
        findEarliestBalanceEffectiveAt(incomes, expenses) !== null,
    }
  }
}
