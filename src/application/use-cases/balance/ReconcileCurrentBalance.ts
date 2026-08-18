import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import type { IBalanceAnchorRepository } from '@domain/repositories'
import { writeBalanceAnchor } from './writeBalanceAnchor'

export class ReconcileCurrentBalance {
  constructor(
    private readonly anchors: IBalanceAnchorRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  execute(input: unknown) {
    return writeBalanceAnchor(this.anchors, this.ids, this.clock, input)
  }
}
