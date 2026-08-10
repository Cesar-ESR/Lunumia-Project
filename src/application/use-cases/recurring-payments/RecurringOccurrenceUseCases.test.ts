import { describe, expect, it, vi } from 'vitest'
import { MarkOccurrenceAsSkipped } from './MarkOccurrenceAsSkipped'

describe('casos de uso de ocurrencias recurrentes', () => {
  it('omite una ocurrencia pendiente sin crear gasto', async () => {
    const occurrence = {
      id: 'occurrence',
      periodId: 'period',
      status: 'pending' as const,
      transactionId: null,
      updatedAt: 'old',
      syncStatus: 'synced' as const,
    }
    const repository = {
      findByPeriod: vi.fn().mockResolvedValue([occurrence]),
      update: vi.fn().mockImplementation(async (value) => value),
    }
    const result = await new MarkOccurrenceAsSkipped(repository as never, {
      now: () => 'now',
    }).execute('period', 'occurrence')
    expect(result.status).toBe('skipped')
    expect(result.transactionId).toBeNull()
  })
})
