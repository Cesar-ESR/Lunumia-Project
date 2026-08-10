import { describe, expect, it, vi } from 'vitest'
import { ListBudgetsByPeriod } from './ListBudgetsByPeriod'

describe('ListBudgetsByPeriod', () => {
  it('returns budgets from the requested period', async () => {
    const budgets = {
      findByPeriod: vi
        .fn()
        .mockResolvedValue([{ id: 'budget-1', periodId: 'period-1' }]),
    }
    const result = await new ListBudgetsByPeriod(budgets as never).execute(
      'period-1',
    )
    expect(budgets.findByPeriod).toHaveBeenCalledWith('period-1')
    expect(result).toEqual([{ id: 'budget-1', periodId: 'period-1' }])
  })
})
