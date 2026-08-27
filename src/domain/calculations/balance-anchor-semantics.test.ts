import { describe, expect, it } from 'vitest'
import type { Expense, ExpenseV2, Income, IncomeV2 } from '@domain/entities'
import {
  findEarliestBalanceEffectiveAt,
  getExpenseBalanceEffectiveAt,
  getIncomeBalanceEffectiveAt,
} from './balance'

const ownerId = 'owner'
const early = '2026-08-01T10:00:00.000Z'
const late = '2026-08-02T10:00:00.000Z'
const base = {
  ownerId,
  periodId: 'period',
  amount: 100,
  description: 'Movimiento',
  date: '2026-08-01',
  createdAt: early,
  updatedAt: early,
  deletedAt: null,
  syncStatus: 'synced' as const,
}
const income = (overrides: Partial<IncomeV2> = {}): IncomeV2 => ({
  ...base,
  id: 'income',
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: late,
  ...overrides,
})
const expense = (overrides: Partial<ExpenseV2> = {}): ExpenseV2 => ({
  ...base,
  id: 'expense',
  categoryId: 'category',
  recurringOccurrenceId: null,
  affectsBalance: true,
  balanceEffectiveAt: late,
  ...overrides,
})

describe('balance effective instants', () => {
  it('uses received IncomeV2 only when it affects balance', () => {
    expect(getIncomeBalanceEffectiveAt(income())).toBe(late)
    expect(
      getIncomeBalanceEffectiveAt(income({ affectsBalance: false })),
    ).toBeNull()
  })

  it.each(['expected', 'cancelled'] as const)(
    'excludes %s IncomeV2',
    (status) => {
      expect(getIncomeBalanceEffectiveAt(income({ status }))).toBeNull()
    },
  )

  it('excludes deleted IncomeV2 and effective ExpenseV2 tombstones', () => {
    expect(getIncomeBalanceEffectiveAt(income({ deletedAt: late }))).toBeNull()
    expect(
      getExpenseBalanceEffectiveAt(expense({ deletedAt: late })),
    ).toBeNull()
  })

  it('uses ExpenseV2 only when it affects balance', () => {
    expect(getExpenseBalanceEffectiveAt(expense())).toBe(late)
    expect(
      getExpenseBalanceEffectiveAt(expense({ affectsBalance: false })),
    ).toBeNull()
  })

  it('preserves legacy createdAt compatibility', () => {
    const legacyIncome: Income = { ...base, id: 'legacy-income' }
    const legacyExpense: Expense = {
      ...base,
      id: 'legacy-expense',
      categoryId: 'category',
      recurringOccurrenceId: null,
    }
    expect(getIncomeBalanceEffectiveAt(legacyIncome)).toBe(early)
    expect(getExpenseBalanceEffectiveAt(legacyExpense)).toBe(early)
  })

  it('finds the deterministic earliest effective instant across both sides', () => {
    expect(
      findEarliestBalanceEffectiveAt(
        [income({ balanceEffectiveAt: late })],
        [expense({ balanceEffectiveAt: early })],
      ),
    ).toBe(early)
  })
})
