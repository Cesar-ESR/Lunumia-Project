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
import {
  getResourceUsageSummary,
  type ResourceUsageSummary,
} from './GetResourceUsageSummary'

export interface FinancialSnapshotReadModel extends FinancialSnapshot {
  resourceUsage: ResourceUsageSummary | null
}

export class GetFinancialSnapshot {
  constructor(
    private readonly periods: IPeriodRepository,
    private readonly anchors: IBalanceAnchorRepository,
    private readonly incomes: IIncomeRepository,
    private readonly expenses: IExpenseRepository,
    private readonly occurrences: IRecurringPaymentOccurrenceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<FinancialSnapshotReadModel> {
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

    const financial = calculateFinancialSnapshot({
      today,
      currentPeriod,
      anchor,
      incomes,
      expenses,
      occurrences,
    })

    return {
      ...financial,
      resourceUsage: getResourceUsageSummary({ anchor, incomes, expenses }),
    }
  }
}
