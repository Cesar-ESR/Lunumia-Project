import { setCurrentBalanceSchema } from '@application/contracts'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import { findEarliestBalanceEffectiveAt } from '@domain/calculations'
import { DomainError } from '@domain/errors'
import type {
  IBalanceAnchorRepository,
  IExpenseRepository,
  IIncomeRepository,
} from '@domain/repositories'
import type { Instant } from '@domain/value-objects'
import { writeBalanceAnchor } from './writeBalanceAnchor'

const EARLIEST_PERSISTABLE_INSTANT = Date.parse('0000-01-01T00:00:00.000Z')

export function instantBefore(value: Instant): Instant {
  const milliseconds = Date.parse(value)
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds <= EARLIEST_PERSISTABLE_INSTANT
  ) {
    throw new DomainError(
      'No se puede crear una referencia anterior al primer movimiento.',
    )
  }
  const previous = new Date(milliseconds - 1).toISOString()
  if (!/^\d{4}-\d{2}-\d{2}T/.test(previous)) {
    throw new DomainError(
      'No se puede representar con seguridad el corte del saldo inicial.',
    )
  }
  return previous
}

export class SetOpeningBalance {
  constructor(
    private readonly anchors: IBalanceAnchorRepository,
    private readonly incomes: IIncomeRepository,
    private readonly expenses: IExpenseRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: unknown) {
    const value = setCurrentBalanceSchema.parse(input)
    const [incomes, expenses] = await Promise.all([
      this.incomes.findAll(),
      this.expenses.findAll(),
    ])
    const earliestEffectiveAt = findEarliestBalanceEffectiveAt(
      incomes,
      expenses,
    )
    return writeBalanceAnchor(
      this.anchors,
      this.ids,
      this.clock,
      value,
      earliestEffectiveAt === null
        ? undefined
        : instantBefore(earliestEffectiveAt),
    )
  }
}
