import { describe, expect, it, vi } from 'vitest'
import type { BalanceAnchor, ExpenseV2, IncomeV2 } from '@domain/entities'
import type {
  IBalanceAnchorRepository,
  IExpenseRepository,
  IIncomeRepository,
} from '@domain/repositories'
import { GetBalanceSetupContext } from './GetBalanceSetupContext'
import { SetOpeningBalance } from './SetOpeningBalance'

const ownerId = 'guest:owner'
const now = '2026-08-27T20:00:00.000Z'
const early = '2026-08-20T11:00:00.000Z'
const late = '2026-08-21T11:00:00.000Z'
const base = {
  ownerId,
  periodId: 'period',
  amount: 100_000,
  description: 'Movimiento',
  date: '2026-08-20',
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
  balanceEffectiveAt: early,
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

function harness(incomes: IncomeV2[] = [], expenses: ExpenseV2[] = []) {
  const create = vi.fn(async (value: BalanceAnchor) => value)
  const findIncomes = vi.fn(async () => incomes)
  const findExpenses = vi.fn(async () => expenses)
  const incomeRepository = {
    findAll: findIncomes,
  } as unknown as IIncomeRepository
  const expenseRepository = {
    findAll: findExpenses,
  } as unknown as IExpenseRepository
  return {
    create,
    findIncomes,
    findExpenses,
    context: new GetBalanceSetupContext(incomeRepository, expenseRepository),
    useCase: new SetOpeningBalance(
      { create } as unknown as IBalanceAnchorRepository,
      { generate: () => 'anchor' },
      { now: () => now },
    ),
  }
}

describe('SetOpeningBalance', () => {
  it.each([125_000, 0, -25_000])(
    'creates a signed opening anchor amount=%s',
    async (amount) => {
      const test = harness()
      await expect(test.useCase.execute({ ownerId, amount })).resolves.toEqual({
        id: 'anchor',
        ownerId,
        amount,
        capturedAt: now,
        ledgerCutoffAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      })
      expect(test.create).toHaveBeenCalledTimes(1)
    },
  )

  it('does not inspect movement history or turn the capture time into a financial cutoff', async () => {
    const test = harness([income()], [expense()])
    const result = await test.useCase.execute({ ownerId, amount: 10_000 })
    expect(test.findIncomes).not.toHaveBeenCalled()
    expect(test.findExpenses).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      capturedAt: now,
      ledgerCutoffAt: now,
    })
    await expect(test.context.execute()).resolves.toEqual({
      hasEffectiveBalanceMovements: true,
    })
  })

  it('ignores expected, history-only and deleted movements', async () => {
    const test = harness(
      [
        income({ status: 'expected', balanceEffectiveAt: null }),
        income({ id: 'history', affectsBalance: false }),
        income({ id: 'deleted', deletedAt: now }),
      ],
      [expense({ affectsBalance: false })],
    )
    const result = await test.useCase.execute({ ownerId, amount: 10_000 })
    expect(result.ledgerCutoffAt).toBe(now)
    await expect(test.context.execute()).resolves.toEqual({
      hasEffectiveBalanceMovements: false,
    })
  })

  it('validates owner and signed amount before reading history', async () => {
    const test = harness([income()])
    await expect(
      test.useCase.execute({ ownerId: '', amount: 1 }),
    ).rejects.toThrow()
    expect(test.findIncomes).not.toHaveBeenCalled()
    expect(test.create).not.toHaveBeenCalled()
  })
})
