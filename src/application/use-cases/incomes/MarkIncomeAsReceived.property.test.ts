import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MarkIncomeAsReceived } from './MarkIncomeAsReceived'
import { calculateFinancialSnapshot } from '@domain/calculations'
import {
  AFTER_CUTOFF,
  makeAnchor,
  makeIncome,
  makePeriod,
  positiveCentsArbitrary,
  PROPERTY_RUNS,
  signedCentsArbitrary,
  TODAY,
} from '@domain/calculations/financial-invariants.arbitraries'
import type { Income } from '@domain/entities'
import type { IIncomeRepository } from '@domain/repositories'

class MemoryIncomeRepository implements IIncomeRepository {
  constructor(private current: Income) {}

  async create(value: Income): Promise<Income> {
    this.current = value
    return value
  }

  async update(value: Income): Promise<Income> {
    this.current = value
    return value
  }

  async delete(): Promise<void> {
    throw new Error('Not used by this property.')
  }

  async findById(id: string): Promise<Income | null> {
    return this.current.id === id ? this.current : null
  }

  async findAll(): Promise<Income[]> {
    return [this.current]
  }

  async findByPeriod(periodId: string): Promise<Income[]> {
    return this.current.periodId === periodId ? [this.current] : []
  }
}

describe('D9 income transition invariant', () => {
  it('P3: expected to received preserves projected closing balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        positiveCentsArbitrary,
        signedCentsArbitrary,
        async (amount, anchorAmount) => {
          const expected = makeIncome(amount, {
            status: 'expected',
            affectsBalance: false,
            balanceEffectiveAt: null,
            date: TODAY,
          })
          const repository = new MemoryIncomeRepository(expected)
          const input = {
            today: TODAY,
            currentPeriod: makePeriod(),
            anchor: makeAnchor(anchorAmount),
            expenses: [],
            occurrences: [],
          } as const
          const before = calculateFinancialSnapshot({
            ...input,
            incomes: [expected],
          })

          const received = await new MarkIncomeAsReceived(repository, {
            now: () => AFTER_CUTOFF,
          }).execute(expected.id)
          const after = calculateFinancialSnapshot({
            ...input,
            incomes: [received],
          })

          expect(after.projectedClosingBalanceCents).toBe(
            before.projectedClosingBalanceCents,
          )
          expect(
            (after.currentBalanceCents ?? 0) -
              (before.currentBalanceCents ?? 0),
          ).toBe(amount)
          expect(before.expectedIncomeCents - after.expectedIncomeCents).toBe(
            amount,
          )
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })
})
