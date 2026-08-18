import type { Clock } from '@application/services/IdGenerator'
import {
  calculateFinancialSnapshot,
  type FinancialSnapshot,
} from '@domain/calculations'
import type {
  IBalanceAnchorRepository,
  IExpenseRepository,
  IIncomeRepository,
  IPeriodRepository,
  IRecurringPaymentOccurrenceRepository,
} from '@domain/repositories'
import { resolveCurrentPeriod } from '@domain/rules'
import { createDateOnly } from '@domain/value-objects'

export class GetFinancialSnapshot {
  constructor(
    private readonly periods: IPeriodRepository,
    private readonly anchors: IBalanceAnchorRepository,
    private readonly incomes: IIncomeRepository,
    private readonly expenses: IExpenseRepository,
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<FinancialSnapshot> {
    const today = createDateOnly(this.clock.now().slice(0, 10))
    const [periods, anchor, incomes, expenses, occurrences] = await Promise.all(
      [
        this.periods.findAll(),
        this.anchors.findLatest(),
        this.incomes.findAll(),
        this.expenses.findAll(),
        this.occurrences.findAll(),
      ],
    )
    const currentPeriod = resolveCurrentPeriod(periods, today)

    return calculateFinancialSnapshot({
      today,
      currentPeriod,
      anchor,
      incomes,
      expenses,
      occurrences,
    })
  }
}
