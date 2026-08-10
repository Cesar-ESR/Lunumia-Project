import { describe, expect, it, vi } from 'vitest'
import type {
  Period,
  SyncCursor,
  SyncEntityType,
  SyncOperation,
} from '@domain/entities'
import { resolveLastWriteWins } from '@domain/rules'
import {
  SyncCoordinator,
  type LocalSyncStore,
  type RemoteApplySummary,
  type RemoteEntityChange,
  type RemoteMutationResult,
  type RemoteSyncGateway,
} from './SyncCoordinator'

const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000002'
const operationId = '30000000-0000-4000-8000-000000000003'
const firstInstant = '2026-08-01T10:00:00.000Z'
const secondInstant = '2026-08-01T11:00:00.000Z'

function period(updatedAt = firstInstant, description = 'monthly'): Period {
  return {
    id: periodId,
    ownerId,
    type: description === 'monthly' ? 'monthly' : 'biweekly',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    createdAt: firstInstant,
    updatedAt,
    deletedAt: null,
    syncStatus: 'pending',
  }
}

function operation(value = period()): SyncOperation {
  return {
    operationId,
    ownerId,
    entityType: 'period',
    entityId: value.id,
    operationType: 'create',
    payload: JSON.stringify(value),
    createdAt: value.updatedAt,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
  }
}

class MemoryLocalStore implements LocalSyncStore {
  readonly operations: SyncOperation[] = []
  readonly records = new Map<string, Period>()
  readonly cursors = new Map<SyncEntityType, SyncCursor>()

  async findUploadable(): Promise<SyncOperation[]> {
    return [...this.operations].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.operationId.localeCompare(right.operationId),
    )
  }
  async markProcessing(value: SyncOperation): Promise<void> {
    this.replaceOperation({
      ...value,
      status: 'processing',
      errorMessage: null,
    })
  }
  async markUploadError(value: SyncOperation, message: string): Promise<void> {
    this.replaceOperation({
      ...value,
      status: 'error',
      errorMessage: message,
      retryCount: value.retryCount + 1,
    })
  }
  async completeUpload(
    value: SyncOperation,
    result: RemoteMutationResult,
  ): Promise<void> {
    const index = this.operations.findIndex(
      ({ operationId: id }) => id === value.operationId,
    )
    if (index >= 0) this.operations.splice(index, 1)
    const current = this.records.get(value.entityId)
    if (current && result.entityUpdatedAt) {
      this.records.set(value.entityId, {
        ...current,
        updatedAt: result.entityUpdatedAt,
        syncStatus: 'synced',
      })
    }
  }
  async countUploadable(): Promise<number> {
    return this.operations.length
  }
  async getCursor(
    _ownerId: string,
    entityType: SyncEntityType,
  ): Promise<SyncCursor> {
    return (
      this.cursors.get(entityType) ?? {
        lastUpdatedAt: null,
        lastEntityId: null,
      }
    )
  }
  async applyRemotePage(
    _ownerId: string,
    entityType: SyncEntityType,
    changes: RemoteEntityChange[],
    cursor: SyncCursor,
  ): Promise<RemoteApplySummary> {
    let downloaded = 0
    let skipped = 0
    let conflicts = 0
    for (const change of changes) {
      if (change.entityType !== 'period') continue
      const current = this.records.get(change.record.id)
      const winner = current
        ? resolveLastWriteWins(current, change.record)
        : 'remote'
      if (current?.syncStatus !== 'synced' && winner !== 'equal') conflicts += 1
      if (winner === 'local') skipped += 1
      else {
        downloaded += 1
        this.records.set(change.record.id, {
          ...change.record,
          syncStatus: 'synced',
        })
      }
    }
    this.cursors.set(entityType, cursor)
    return { downloaded, skipped, conflicts }
  }
  async markDownloadComplete(): Promise<void> {}

  private replaceOperation(value: SyncOperation): void {
    const index = this.operations.findIndex(
      ({ operationId: id }) => id === value.operationId,
    )
    if (index >= 0) this.operations[index] = value
  }
}

class MemoryRemoteGateway implements RemoteSyncGateway {
  readonly processed = new Set<string>()
  readonly records = new Map<string, Period>()
  verifyCalls = 0
  applyCalls = 0
  readonly downloadCalls = new Map<SyncEntityType, number>()
  failAfterFirstApply = false

  async verifyAuthenticatedOwner(candidate: string): Promise<void> {
    this.verifyCalls += 1
    if (candidate !== ownerId) throw new Error('sesión incorrecta')
  }
  async applyOperation(value: SyncOperation): Promise<RemoteMutationResult> {
    this.applyCalls += 1
    if (this.processed.has(value.operationId)) {
      const current = this.records.get(value.entityId)
      return {
        status: 'already_processed',
        entityUpdatedAt: current?.updatedAt ?? null,
        relatedEntityId: null,
        relatedUpdatedAt: null,
      }
    }
    const incoming = JSON.parse(value.payload) as Period
    const current = this.records.get(incoming.id)
    const status =
      current && resolveLastWriteWins(incoming, current) === 'remote'
        ? 'remote_wins'
        : 'applied'
    if (status === 'applied')
      this.records.set(incoming.id, { ...incoming, syncStatus: 'synced' })
    this.processed.add(value.operationId)
    if (this.failAfterFirstApply) {
      this.failAfterFirstApply = false
      throw new Error('respuesta perdida')
    }
    return {
      status,
      entityUpdatedAt: this.records.get(incoming.id)?.updatedAt ?? null,
      relatedEntityId: null,
      relatedUpdatedAt: null,
    }
  }
  async downloadPage(
    _ownerId: string,
    entityType: SyncEntityType,
    cursor: SyncCursor,
    limit: number,
  ): Promise<RemoteEntityChange[]> {
    this.downloadCalls.set(
      entityType,
      (this.downloadCalls.get(entityType) ?? 0) + 1,
    )
    if (entityType !== 'period') return []
    return [...this.records.values()]
      .sort(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) ||
          left.id.localeCompare(right.id),
      )
      .filter(
        (record) =>
          cursor.lastUpdatedAt === null ||
          record.updatedAt > cursor.lastUpdatedAt ||
          (record.updatedAt === cursor.lastUpdatedAt &&
            record.id > (cursor.lastEntityId ?? '')),
      )
      .slice(0, limit)
      .map((record) => ({ entityType: 'period' as const, record }))
  }
}

describe('SyncCoordinator', () => {
  it('rechaza guest antes de invocar el adaptador remoto', async () => {
    const remote = new MemoryRemoteGateway()
    const result = await new SyncCoordinator(
      new MemoryLocalStore(),
      remote,
    ).sync('guest:local')
    expect(result.failed).toBe(1)
    expect(remote.verifyCalls).toBe(0)
    expect(remote.applyCalls).toBe(0)
  })

  it('retiene la operación si se pierde la respuesta y el reintento converge por operationId', async () => {
    const local = new MemoryLocalStore()
    const remote = new MemoryRemoteGateway()
    const value = period()
    local.records.set(value.id, value)
    local.operations.push(operation(value))
    remote.failAfterFirstApply = true
    const coordinator = new SyncCoordinator(local, remote, () => secondInstant)

    const failed = await coordinator.sync(ownerId)
    expect(failed.failed).toBe(1)
    expect(local.operations[0]).toMatchObject({
      status: 'error',
      retryCount: 1,
    })
    expect(remote.records).toHaveLength(1)

    const retried = await coordinator.sync(ownerId)
    expect(retried.failed).toBe(0)
    expect(retried.skipped).toBe(1)
    expect(local.operations).toHaveLength(0)
    expect(remote.records).toHaveLength(1)
  })

  it('hace converger dos réplicas mediante upload seguido de download', async () => {
    const remote = new MemoryRemoteGateway()
    const localA = new MemoryLocalStore()
    const localB = new MemoryLocalStore()
    const coordinatorA = new SyncCoordinator(localA, remote)
    const coordinatorB = new SyncCoordinator(localB, remote)

    const initial = period()
    localA.records.set(initial.id, initial)
    localA.operations.push(operation(initial))
    await coordinatorA.sync(ownerId)
    await coordinatorB.sync(ownerId)

    const changed = period(secondInstant, 'biweekly')
    localB.records.set(changed.id, changed)
    localB.operations.push({
      ...operation(changed),
      operationId: '40000000-0000-4000-8000-000000000004',
      operationType: 'update',
    })
    await coordinatorB.sync(ownerId)
    await coordinatorA.sync(ownerId)

    expect(localA.records.get(periodId)).toEqual(localB.records.get(periodId))
    expect(localA.records.get(periodId)).toMatchObject({
      type: 'biweekly',
      syncStatus: 'synced',
    })
  })

  it('descarga páginas keyset de 100 registros sin saltar empates de updatedAt', async () => {
    const remote = new MemoryRemoteGateway()
    for (let index = 1; index <= 101; index += 1) {
      const id = `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`
      remote.records.set(id, { ...period(), id, syncStatus: 'synced' })
    }
    const local = new MemoryLocalStore()

    const result = await new SyncCoordinator(local, remote).sync(ownerId)

    expect(result.downloaded).toBe(101)
    expect(local.records.size).toBe(101)
    expect(remote.downloadCalls.get('period')).toBe(2)
    expect(local.cursors.get('period')).toEqual({
      lastUpdatedAt: firstInstant,
      lastEntityId: '20000000-0000-4000-8000-000000000101',
    })
  })

  it('impide dos ejecuciones concurrentes para el mismo propietario', async () => {
    let releaseVerification: (() => void) | undefined
    const remote = new MemoryRemoteGateway()
    remote.verifyAuthenticatedOwner = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseVerification = resolve
        }),
    )
    const coordinator = new SyncCoordinator(new MemoryLocalStore(), remote)

    const first = coordinator.sync(ownerId)
    await Promise.resolve()
    const second = await coordinator.sync(ownerId)
    expect(second.failed).toBe(1)
    expect(second.errors[0]?.message).toContain('activa')
    releaseVerification?.()
    await first
  })
})
