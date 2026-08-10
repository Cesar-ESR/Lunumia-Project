import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { SyncOperation } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { DexieSyncOperationRepository } from './DexieSyncOperationRepository'

const ownerId = '10000000-0000-4000-8000-000000000001'
const otherOwnerId = '20000000-0000-4000-8000-000000000002'
const operation = (
  operationId: string,
  createdAt: string,
  owner = ownerId,
): SyncOperation => ({
  operationId,
  ownerId: owner,
  entityType: 'expense',
  entityId: 'entity',
  operationType: 'create',
  payload: '{}',
  createdAt,
  status: 'pending',
  errorMessage: null,
  retryCount: 0,
})
let database: GastoClaroDB | undefined

afterEach(async () => {
  if (database) {
    database.close()
    await Dexie.delete(database.name)
    database = undefined
  }
})

describe('DexieSyncOperationRepository', () => {
  it('mantiene orden cronológico determinista e idempotencia por operationId', async () => {
    database = new GastoClaroDB('sync-queue-test')
    const repository = new DexieSyncOperationRepository(database, ownerId)
    await repository.enqueue(
      operation(
        '30000000-0000-4000-8000-000000000003',
        '2026-01-02T00:00:00.000Z',
      ),
    )
    await repository.enqueue(
      operation(
        '20000000-0000-4000-8000-000000000002',
        '2026-01-01T00:00:00.000Z',
      ),
    )
    await repository.enqueue(
      operation(
        '10000000-0000-4000-8000-000000000001',
        '2026-01-01T00:00:00.000Z',
      ),
    )
    await repository.enqueue(
      operation(
        '10000000-0000-4000-8000-000000000001',
        '2026-01-01T00:00:00.000Z',
      ),
    )
    expect(
      (await repository.findPending()).map((value) => value.operationId),
    ).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
    ])
  })

  it('aísla propietarios y cubre el ciclo de estados y limpieza', async () => {
    database = new GastoClaroDB('sync-owner-test')
    const repository = new DexieSyncOperationRepository(database)
    const firstId = '10000000-0000-4000-8000-000000000010'
    const otherId = '20000000-0000-4000-8000-000000000020'
    await repository.enqueue(operation(firstId, '2026-01-01T00:00:00.000Z'))
    await repository.enqueue(
      operation(otherId, '2026-01-01T00:00:00.000Z', otherOwnerId),
    )
    expect(await repository.countPending(ownerId)).toBe(1)
    expect(await repository.findByOperationId(otherId, ownerId)).toBeNull()
    await repository.markProcessing(firstId, ownerId)
    expect((await repository.findByOperationId(firstId, ownerId))?.status).toBe(
      'processing',
    )
    await repository.markError(firstId, 'network', ownerId)
    expect(await repository.findByOperationId(firstId, ownerId)).toMatchObject({
      status: 'error',
      retryCount: 1,
      errorMessage: 'network',
    })
    await repository.remove(firstId, ownerId)
    await repository.clearByOwner(otherOwnerId)
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('rechaza operaciones invitadas o de otro propietario', async () => {
    database = new GastoClaroDB('sync-guest-test')
    const repository = new DexieSyncOperationRepository(database, ownerId)
    await expect(
      repository.enqueue(
        operation(
          '10000000-0000-4000-8000-000000000011',
          '2026-01-01T00:00:00.000Z',
          'guest:temporary',
        ),
      ),
    ).rejects.toThrow()
    await expect(
      repository.enqueue(
        operation(
          '10000000-0000-4000-8000-000000000012',
          '2026-01-01T00:00:00.000Z',
          otherOwnerId,
        ),
      ),
    ).rejects.toThrow()
    expect(await database.syncOperations.count()).toBe(0)
  })
})
