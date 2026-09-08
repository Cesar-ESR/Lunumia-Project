import { afterEach, describe, expect, it } from 'vitest'
import type { ExpenseV2 } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieExpenseRepository } from '@infrastructure/local/repositories/DexieExpenseRepository'
import { DexieSyncStore } from './DexieSyncStore'
import {
  serializeOperationPayload,
  deserializeRemoteChange,
} from './SyncMapper'

const ownerId = '10000000-0000-4000-8000-000000000001'
const now = '2026-08-01T10:00:00.000Z'
const databases: GastoClaroDB[] = []
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()))
})

describe('Expense provenance serialization and device rehydration', () => {
  it.each(['receipt', 'manual', null, undefined] as const)(
    'preserves %s through outbound/inbound and reload',
    async (source) => {
      const a = new GastoClaroDB(`source-a-${crypto.randomUUID()}`)
      const b = new GastoClaroDB(`source-b-${crypto.randomUUID()}`)
      databases.push(a, b)
      const expense: ExpenseV2 = {
        id: '40000000-0000-4000-8000-000000000004',
        ownerId,
        periodId: '20000000-0000-4000-8000-000000000002',
        categoryId: '30000000-0000-4000-8000-000000000003',
        amount: 100600,
        description: 'Synthetic receipt',
        date: '2026-08-01',
        recurringOccurrenceId: null,
        affectsBalance: true,
        balanceEffectiveAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
        ...(source !== undefined ? { source } : {}),
      }
      await new DexieExpenseRepository(a, ownerId).create(expense)
      const operations = await a.syncOperations.toArray()
      expect(operations).toHaveLength(1)
      const remote = serializeOperationPayload(operations[0]!)
      expect(remote).toMatchObject({ amount: 100600 })
      if (source === undefined) expect(remote).not.toHaveProperty('source')
      else expect(remote).toHaveProperty('source', source)
      const change = deserializeRemoteChange('expense', remote)
      await new DexieSyncStore(b).applyRemotePage(
        ownerId,
        'expense',
        [change],
        { lastUpdatedAt: now, lastEntityId: expense.id },
      )
      b.close()
      await b.open()
      const restored = await new DexieExpenseRepository(b, ownerId).findById(
        expense.id,
      )
      expect(restored).toEqual({ ...expense, syncStatus: 'synced' })
      expect(await b.syncOperations.count()).toBe(0)
    },
  )
})
