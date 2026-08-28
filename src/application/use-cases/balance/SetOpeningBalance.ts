import { setCurrentBalanceSchema } from '@application/contracts'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import type { IBalanceAnchorRepository } from '@domain/repositories'
import { writeBalanceAnchor } from './writeBalanceAnchor'

export class SetOpeningBalance {
  constructor(
    private readonly anchors: IBalanceAnchorRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: unknown) {
    const value = setCurrentBalanceSchema.parse(input)
    return writeBalanceAnchor(this.anchors, this.ids, this.clock, value)
  }
}
