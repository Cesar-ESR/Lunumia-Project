import { waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncOperation } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieSyncQueueObserver } from './DexieSyncQueueObserver'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-08-01T12:00:00.000Z'
const databases: GastoClaroDB[] = []

function operation(
  operationId: string,
  ownerId = OWNER_ID,
  status: SyncOperation['status'] = 'pending',
): SyncOperation {
  return {
    operationId,
    ownerId,
    entityType: 'expense',
    entityId: crypto.randomUUID(),
    operationType: 'create',
    payload: '{}',
    createdAt: NOW,
    status,
    errorMessage: null,
    retryCount: 0,
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('DexieSyncQueueObserver', () => {
  it('observa la cola del propietario sin polling y deja de emitir al limpiar', async () => {
    const database = new GastoClaroDB('queue-observer-' + crypto.randomUUID())
    databases.push(database)
    const observer = new DexieSyncQueueObserver(database)
    const listener = vi.fn()
    const unsubscribe = observer.subscribe(OWNER_ID, listener)

    await database.syncOperations.bulkPut([
      operation(crypto.randomUUID()),
      operation(crypto.randomUUID(), OTHER_OWNER),
    ])
    await waitFor(() => expect(listener).toHaveBeenLastCalledWith(1))
    expect(await observer.count(OWNER_ID)).toBe(1)

    unsubscribe()
    listener.mockClear()
    await database.syncOperations.put(operation(crypto.randomUUID()))
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(listener).not.toHaveBeenCalled()
  })
})
