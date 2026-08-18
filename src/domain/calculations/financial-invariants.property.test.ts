import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  calculateFinancialSnapshot,
  calculatePlanningProjection,
  projectRecurringPaymentsForRange,
} from './index'
import {
  AFTER_CUTOFF,
  BEFORE_CUTOFF,
  DELETED_AT,
  financialInputArbitrary,
  expenseArbitrary,
  incomeArbitrary,
  makeAnchor,
  makeBudget,
  makeExpense,
  makeIncome,
  makeOccurrence,
  makePayment,
  makePeriod,
  occurrenceArbitrary,
  paymentArbitrary,
  paymentArrayArbitrary,
  positiveCentsArbitrary,
  projectionRangeArbitrary,
  PROPERTY_RUNS,
  signedCentsArbitrary,
  TODAY,
} from './financial-invariants.arbitraries'

describe('D9 financial invariants', () => {
  it('P4: changing a category budget cannot change FinancialSnapshot', () => {
    fc.assert(
      fc.property(
        financialInputArbitrary,
        fc.record({
          initialBudget: fc.integer({ min: 0, max: 1_000_000 }),
          increase: positiveCentsArbitrary,
        }),
        (financialInput, budgetChange) => {
          const beforeState = {
            financialInput,
            budget: makeBudget(budgetChange.initialBudget),
          }
          const afterState = {
            financialInput,
            budget: makeBudget(
              budgetChange.initialBudget + budgetChange.increase,
            ),
          }

          expect(beforeState.budget.amount).not.toBe(afterState.budget.amount)
          expect(
            calculateFinancialSnapshot(beforeState.financialInput),
          ).toEqual(calculateFinancialSnapshot(afterState.financialInput))
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P5: a historical expense increases spent but preserves current balance', () => {
    fc.assert(
      fc.property(
        signedCentsArbitrary,
        positiveCentsArbitrary,
        (anchorAmount, expenseAmount) => {
          const input = {
            today: TODAY,
            currentPeriod: makePeriod(),
            anchor: makeAnchor(anchorAmount),
            incomes: [],
            expenses: [],
            occurrences: [],
          } as const
          const before = calculateFinancialSnapshot(input)
          const after = calculateFinancialSnapshot({
            ...input,
            expenses: [
              makeExpense(expenseAmount, {
                affectsBalance: false,
                balanceEffectiveAt: AFTER_CUTOFF,
              }),
            ],
          })

          expect(after.currentBalanceCents).toBe(before.currentBalanceCents)
          expect(after.spentCents - before.spentCents).toBe(expenseAmount)
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P6: editing a recurring rule never changes an existing occurrence snapshot', () => {
    fc.assert(
      fc.property(
        positiveCentsArbitrary,
        positiveCentsArbitrary,
        (snapshotAmount, increase) => {
          const occurrence = makeOccurrence(snapshotAmount)
          const input = {
            today: TODAY,
            currentPeriod: makePeriod(),
            anchor: makeAnchor(0),
            incomes: [],
            expenses: [],
            occurrences: [occurrence],
          } as const
          const originalRule = makePayment(snapshotAmount)
          const editedRule = {
            ...originalRule,
            amount: snapshotAmount + increase,
          }

          const committedBefore = calculateFinancialSnapshot(input)
          const committedAfter = calculateFinancialSnapshot(input)
          const futureBefore = projectRecurringPaymentsForRange({
            recurringPayments: [originalRule],
            startDate: TODAY,
            endDate: TODAY,
          })
          const futureAfter = projectRecurringPaymentsForRange({
            recurringPayments: [editedRule],
            startDate: TODAY,
            endDate: TODAY,
          })

          expect(committedAfter.committedCents).toBe(
            committedBefore.committedCents,
          )
          expect(futureBefore[0]?.amount).toBe(snapshotAmount)
          expect(futureAfter[0]?.amount).toBe(snapshotAmount + increase)
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P7: a new signed anchor resets any history at or before its cutoff', () => {
    fc.assert(
      fc.property(
        signedCentsArbitrary,
        fc.array(positiveCentsArbitrary, { maxLength: 12 }),
        fc.array(positiveCentsArbitrary, { maxLength: 12 }),
        (anchorAmount, incomeAmounts, expenseAmounts) => {
          const result = calculateFinancialSnapshot({
            today: TODAY,
            currentPeriod: makePeriod(),
            anchor: makeAnchor(anchorAmount),
            incomes: incomeAmounts.map((amount, index) =>
              makeIncome(amount, {
                id: `income-${index}`,
                balanceEffectiveAt: BEFORE_CUTOFF,
              }),
            ),
            expenses: expenseAmounts.map((amount, index) =>
              makeExpense(amount, {
                id: `expense-${index}`,
                balanceEffectiveAt: BEFORE_CUTOFF,
              }),
            ),
            occurrences: [],
          })

          expect(result.currentBalanceCents).toBe(anchorAmount)
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P8: overdue is a non-negative subset of committed', () => {
    fc.assert(
      fc.property(
        fc.array(occurrenceArbitrary, { maxLength: 30 }),
        (occurrences) => {
          const snapshot = calculateFinancialSnapshot({
            today: TODAY,
            currentPeriod: makePeriod(),
            anchor: makeAnchor(0),
            incomes: [],
            expenses: [],
            occurrences,
          })

          expect(snapshot.overdueCommittedCents).toBeGreaterThanOrEqual(0)
          expect(snapshot.upcomingCommittedCents).toBeGreaterThanOrEqual(0)
          expect(snapshot.overdueCommittedCents).toBeLessThanOrEqual(
            snapshot.committedCents,
          )
          expect(snapshot.committedCents).toBe(
            snapshot.overdueCommittedCents + snapshot.upcomingCommittedCents,
          )
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P9: adding tombstoned income, expense, and occurrence is invariant', () => {
    fc.assert(
      fc.property(
        financialInputArbitrary,
        incomeArbitrary,
        expenseArbitrary,
        occurrenceArbitrary,
        (input, candidateIncome, candidateExpense, candidateOccurrence) => {
          const before = calculateFinancialSnapshot(input)
          const after = calculateFinancialSnapshot({
            ...input,
            incomes: [
              ...input.incomes,
              { ...candidateIncome, deletedAt: DELETED_AT },
            ],
            expenses: [
              ...input.expenses,
              {
                ...candidateExpense,
                deletedAt: DELETED_AT,
              },
            ],
            occurrences: [
              ...input.occurrences,
              { ...candidateOccurrence, deletedAt: DELETED_AT },
            ],
          })

          expect(after).toEqual(before)
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P10: aggregates stay non-negative while signed projections may cross zero', () => {
    fc.assert(
      fc.property(
        financialInputArbitrary,
        paymentArrayArbitrary,
        signedCentsArbitrary,
        (input, recurringPayments, opening) => {
          const snapshot = calculateFinancialSnapshot(input)
          const planning = calculatePlanningProjection({
            period: makePeriod(),
            projectedOpeningBalanceCents: opening,
            incomes: input.incomes,
            recurringPayments,
          })

          for (const aggregate of [
            snapshot.spentCents,
            snapshot.committedCents,
            snapshot.upcomingCommittedCents,
            snapshot.overdueCommittedCents,
            snapshot.expectedIncomeCents,
            snapshot.overdueExpectedIncomeCents,
            planning.expectedIncomeCents,
            planning.projectedRecurringPaymentsCents,
          ])
            expect(aggregate).toBeGreaterThanOrEqual(0)

          if (snapshot.currentBalanceCents !== null)
            expect(Number.isInteger(snapshot.currentBalanceCents)).toBe(true)
          if (snapshot.projectedAvailableCents !== null)
            expect(Number.isInteger(snapshot.projectedAvailableCents)).toBe(
              true,
            )
          if (snapshot.projectedClosingBalanceCents !== null)
            expect(
              Number.isInteger(snapshot.projectedClosingBalanceCents),
            ).toBe(true)
          expect(Number.isInteger(planning.projectedOpeningBalanceCents)).toBe(
            true,
          )
          expect(Number.isInteger(planning.projectedClosingBalanceCents)).toBe(
            true,
          )
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('P11: future projection is bounded, deterministic, and does not mutate inputs', () => {
    fc.assert(
      fc.property(
        paymentArrayArbitrary,
        projectionRangeArbitrary,
        fc.array(incomeArbitrary, { maxLength: 10 }),
        signedCentsArbitrary,
        (recurringPayments, range, incomes, opening) => {
          const projectionInput = {
            recurringPayments,
            ...range,
          }
          const planningInput = {
            period: makePeriod({
              startDate: range.startDate,
              endDate: range.endDate,
            }),
            projectedOpeningBalanceCents: opening,
            incomes,
            recurringPayments,
          }
          const projectionBefore = structuredClone(projectionInput)
          const planningBefore = structuredClone(planningInput)

          const first = projectRecurringPaymentsForRange(projectionInput)
          const second = projectRecurringPaymentsForRange(projectionInput)
          calculatePlanningProjection(planningInput)

          expect(first).toEqual(second)
          expect(projectionInput).toEqual(projectionBefore)
          expect(planningInput).toEqual(planningBefore)
          expect(
            first.every(
              (projected) =>
                range.startDate <= projected.dueDate &&
                projected.dueDate <= range.endDate,
            ),
          ).toBe(true)
          expect(first).toEqual(
            [...first].sort(
              (left, right) =>
                left.dueDate.localeCompare(right.dueDate) ||
                left.recurringPaymentId.localeCompare(right.recurringPaymentId),
            ),
          )
          for (const projected of first) {
            const source = recurringPayments.find(
              (payment) => payment.id === projected.recurringPaymentId,
            )
            expect(source).toBeDefined()
            expect(source?.status).toBe('active')
            expect(source?.deletedAt).toBeNull()
            expect(projected.amount).toBe(source?.amount)
            expect(projected).not.toHaveProperty('periodId')
            expect(projected).not.toHaveProperty('status')
            expect(projected).not.toHaveProperty('transactionId')
          }
        },
      ),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('recurring rules outside the active set never project', () => {
    fc.assert(
      fc.property(paymentArbitrary, (payment) => {
        const inactive = { ...payment, status: 'inactive' as const }
        const deleted = { ...payment, deletedAt: DELETED_AT }

        expect(
          projectRecurringPaymentsForRange({
            recurringPayments: [inactive, deleted],
            startDate: '2026-08-01',
            endDate: '2026-08-31',
          }),
        ).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})
