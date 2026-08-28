import Dexie from 'dexie'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  SyncCoordinator,
  type RemoteEntityChange,
  type RemoteMutationResult,
  type RemoteSyncGateway,
} from '@application/services/SyncCoordinator'
import type {
  Period,
  SyncCursor,
  SyncEntityType,
  SyncOperation,
} from '@domain/entities'
import { calculateBackoffDelay } from '@application/services/SyncOrchestrator'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexiePeriodRepository } from '@infrastructure/local/repositories/DexiePeriodRepository'
import type { SyncMutationDependencies } from '@infrastructure/local/sync-mutations'
import {
  deserializeRemoteChange,
  serializeOperationPayload,
} from './SyncMapper'
import { DexieSyncStore } from './DexieSyncStore'
import { instantArbitrary, periodArbitrary } from './property/arbitraries'
import {
  IdempotentRemoteModel,
  referenceBackoff,
  referenceWinner,
} from './property/models'

function operationFor(
  period: Period,
  operationId = crypto.randomUUID(),
): SyncOperation {
  return {
    operationId,
    ownerId: period.ownerId,
    entityType: 'period',
    entityId: period.id,
    operationType: period.deletedAt === null ? 'update' : 'delete',
    payload: JSON.stringify(period),
    createdAt: period.updatedAt,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
  }
}

class SharedPeriodRemote implements RemoteSyncGateway {
  private readonly processedOperationIds = new Set<string>()
  private readonly periods = new Map<string, Period>()

  constructor(private readonly ownerId: string) {}

  async verifyAuthenticatedOwner(ownerId: string): Promise<void> {
    if (ownerId !== this.ownerId)
      throw new Error('El propietario autenticado no coincide.')
  }

  async findEquivalentPeriod(
    ownerId: string,
    candidate: Period,
  ): Promise<Period | null> {
    await this.verifyAuthenticatedOwner(ownerId)
    return (
      [...this.periods.values()].find(
        (value) =>
          value.id !== candidate.id &&
          value.type === candidate.type &&
          value.startDate === candidate.startDate &&
          value.endDate === candidate.endDate &&
          value.deletedAt === null,
      ) ?? null
    )
  }

  async applyOperation(
    operation: SyncOperation,
  ): Promise<RemoteMutationResult> {
    if (operation.ownerId !== this.ownerId || operation.entityType !== 'period')
      throw new Error('La operacion no pertenece al remoto compartido.')

    const current = this.periods.get(operation.entityId)
    if (this.processedOperationIds.has(operation.operationId)) {
      return {
        status: 'already_processed',
        entityUpdatedAt: current?.updatedAt ?? null,
        relatedEntityId: null,
        relatedUpdatedAt: null,
      }
    }

    const change = deserializeRemoteChange(
      'period',
      serializeOperationPayload(operation),
    )
    if (change.entityType !== 'period')
      throw new Error('Se esperaba un periodo remoto.')

    const incoming = change.record
    const remoteWins = current
      ? referenceWinner(current, incoming) === 'local'
      : false
    const winner = remoteWins && current ? current : incoming
    this.periods.set(winner.id, winner)
    this.processedOperationIds.add(operation.operationId)

    return {
      status: remoteWins ? 'remote_wins' : 'applied',
      entityUpdatedAt: winner.updatedAt,
      relatedEntityId: null,
      relatedUpdatedAt: null,
    }
  }

  async downloadPage(
    ownerId: string,
    entityType: SyncEntityType,
    cursor: SyncCursor,
    limit: number,
  ): Promise<RemoteEntityChange[]> {
    await this.verifyAuthenticatedOwner(ownerId)
    if (entityType !== 'period') return []

    return [...this.periods.values()]
      .filter((period) => isAfterCursor(period, cursor))
      .sort(comparePeriodsByCursor)
      .slice(0, limit)
      .map((record) => ({ entityType: 'period', record }))
  }

  get processedCount(): number {
    return this.processedOperationIds.size
  }

  get size(): number {
    return this.periods.size
  }

  get(id: string): Period | undefined {
    return this.periods.get(id)
  }
}

function comparePeriodsByCursor(left: Period, right: Period): number {
  return (
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.id.localeCompare(right.id)
  )
}

function isAfterCursor(period: Period, cursor: SyncCursor): boolean {
  if (cursor.lastUpdatedAt === null) return true
  const timestamp = period.updatedAt.localeCompare(cursor.lastUpdatedAt)
  return (
    timestamp > 0 ||
    (timestamp === 0 && period.id > (cursor.lastEntityId ?? ''))
  )
}

function mutationDependencies(
  operationId: string,
  now: string,
): SyncMutationDependencies {
  return {
    ids: { generate: () => operationId },
    clock: { now: () => now },
    origin: 'local-user',
  }
}

describe('propiedades del núcleo de sincronización', () => {
  it('PBT: camelCase ↔ snake_case conserva DateOnly, timestamps y tombstones', () => {
    fc.assert(
      fc.property(periodArbitrary, (period) => {
        const remote = serializeOperationPayload(operationFor(period))
        const roundTrip = deserializeRemoteChange('period', remote).record
        expect(roundTrip).toEqual({ ...period, syncStatus: 'synced' })
        expect(remote).toMatchObject({
          user_id: period.ownerId,
          start_date: period.startDate,
          end_date: period.endDate,
          updated_at: period.updatedAt,
          deleted_at: period.deletedAt,
        })
      }),
      { numRuns: 200 },
    )
  })

  it('PBT: repetir la misma operación remota es idempotente', () => {
    fc.assert(
      fc.property(
        periodArbitrary,
        fc.integer({ min: 2, max: 30 }),
        (period, repetitions) => {
          const remote = new IdempotentRemoteModel()
          const operation = operationFor(period)
          const results = Array.from({ length: repetitions }, () =>
            remote.apply(operation, period),
          )
          expect(results[0]).toBe('applied')
          expect(results.slice(1)).toEqual(
            Array.from({ length: repetitions - 1 }, () => 'already_processed'),
          )
          expect(remote.processedCount).toBe(1)
          expect(remote.size).toBe(1)
          expect(remote.get(period.id)).toEqual(period)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('PBT: los reintentos en cualquier orden convergen por LWW', () => {
    fc.assert(
      fc.property(
        periodArbitrary,
        instantArbitrary,
        fc.shuffledSubarray([0, 1, 0, 1], { minLength: 4, maxLength: 4 }),
        (first, secondUpdatedAt, order) => {
          fc.pre(secondUpdatedAt !== first.updatedAt)
          const second: Period = {
            ...first,
            updatedAt: secondUpdatedAt,
            type: first.type === 'monthly' ? 'biweekly' : 'monthly',
          }
          const versions = [first, second] as const
          const operations = [
            operationFor(first),
            operationFor(second),
          ] as const
          const remote = new IdempotentRemoteModel()
          order.forEach((index) =>
            remote.apply(operations[index]!, versions[index]!),
          )
          const decision = referenceWinner(first, second)
          const expected =
            decision === 'local'
              ? first
              : decision === 'remote'
                ? second
                : versions[order[0]!]!
          expect(remote.get(first.id)).toEqual(expected)
          expect(remote.processedCount).toBe(2)
          expect(remote.size).toBe(1)
        },
      ),
      { numRuns: 150 },
    )
  })

  it('PBT: dos réplicas Dexie separadas convergen tras intercambiar cambios', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          generated: periodArbitrary,
          ownerId: fc.uuid(),
          entityId: fc.uuid(),
          operationIds: fc
            .tuple(fc.uuid(), fc.uuid(), fc.uuid())
            .filter((ids) => new Set(ids).size === ids.length),
          baseSeconds: fc.integer({ min: 0, max: 31_536_000 }),
          deleteOnSecondDevice: fc.boolean(),
        }),
        async ({
          generated,
          ownerId,
          entityId,
          operationIds,
          baseSeconds,
          deleteOnSecondDevice,
        }) => {
          const firstDb = new GastoClaroDB(`device-a-${crypto.randomUUID()}`)
          const secondDb = new GastoClaroDB(`device-b-${crypto.randomUUID()}`)
          try {
            const firstUpdatedAt = new Date(
              Date.UTC(2030, 0, 1) + baseSeconds * 1_000,
            ).toISOString()
            const secondUpdatedAt = new Date(
              Date.parse(firstUpdatedAt) + 1_000,
            ).toISOString()
            const thirdUpdatedAt = new Date(
              Date.parse(secondUpdatedAt) + 1_000,
            ).toISOString()
            const first: Period = {
              ...generated,
              id: entityId,
              ownerId,
              createdAt: firstUpdatedAt,
              updatedAt: firstUpdatedAt,
              deletedAt: null,
              syncStatus: 'pending',
            }
            const second: Period = {
              ...first,
              updatedAt: secondUpdatedAt,
              type: first.type === 'monthly' ? 'biweekly' : 'monthly',
            }

            await new DexiePeriodRepository(
              firstDb,
              ownerId,
              mutationDependencies(operationIds[0], firstUpdatedAt),
            ).create(first)
            await new DexiePeriodRepository(
              firstDb,
              ownerId,
              mutationDependencies(operationIds[1], secondUpdatedAt),
            ).update(second)

            const remote = new SharedPeriodRemote(ownerId)
            const firstStore = new DexieSyncStore(firstDb)
            const secondStore = new DexieSyncStore(secondDb)
            const firstSync = new SyncCoordinator(
              firstStore,
              remote,
              () => thirdUpdatedAt,
            )
            const secondSync = new SyncCoordinator(
              secondStore,
              remote,
              () => thirdUpdatedAt,
            )

            expect((await firstSync.sync(ownerId)).failed).toBe(0)
            expect((await secondSync.sync(ownerId)).failed).toBe(0)

            const downloadedBySecond = await secondDb.periods.get(entityId)
            if (!downloadedBySecond)
              throw new Error('El segundo dispositivo no descargo el periodo.')
            const secondRepository = new DexiePeriodRepository(
              secondDb,
              ownerId,
              mutationDependencies(operationIds[2], thirdUpdatedAt),
            )
            if (deleteOnSecondDevice) {
              await secondRepository.delete(entityId)
            } else {
              await secondRepository.update({
                ...downloadedBySecond,
                type:
                  downloadedBySecond.type === 'monthly'
                    ? 'biweekly'
                    : 'monthly',
                updatedAt: thirdUpdatedAt,
                syncStatus: 'pending',
              })
            }

            expect((await secondSync.sync(ownerId)).failed).toBe(0)
            expect((await firstSync.sync(ownerId)).failed).toBe(0)

            const stableFirst = await firstSync.sync(ownerId)
            const stableSecond = await secondSync.sync(ownerId)
            expect(stableFirst).toMatchObject({ uploaded: 0, failed: 0 })
            expect(stableSecond).toMatchObject({ uploaded: 0, failed: 0 })

            const firstRecord = await firstDb.periods.get(entityId)
            const secondRecord = await secondDb.periods.get(entityId)
            const remoteRecord = remote.get(entityId)
            expect(firstRecord).toEqual(secondRecord)
            expect(firstRecord).toEqual(remoteRecord)
            expect(firstRecord?.deletedAt !== null).toBe(deleteOnSecondDevice)
            expect(await firstDb.syncOperations.count()).toBe(0)
            expect(await secondDb.syncOperations.count()).toBe(0)
            expect(await firstDb.periods.count()).toBe(1)
            expect(await secondDb.periods.count()).toBe(1)
            expect(remote.size).toBe(1)
            expect(remote.processedCount).toBe(3)

            const expectedCursor: SyncCursor = {
              lastUpdatedAt: thirdUpdatedAt,
              lastEntityId: entityId,
            }
            expect(await firstStore.getCursor(ownerId, 'period')).toEqual(
              expectedCursor,
            )
            expect(await secondStore.getCursor(ownerId, 'period')).toEqual(
              expectedCursor,
            )
          } finally {
            firstDb.close()
            secondDb.close()
            await Dexie.delete(firstDb.name)
            await Dexie.delete(secondDb.name)
          }
        },
      ),
      { numRuns: 30 },
    )
  }, 15_000)

  it('PBT: backoff exponencial con jitter coincide con un modelo independiente', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 10_000, max: 120_000 }),
        fc.integer({ min: 1, max: 4 }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (retry, base, maximum, multiplier, jitter, random) => {
          const config = {
            baseDelayMs: base,
            maxDelayMs: maximum,
            multiplier,
            jitterRatio: jitter,
            maxAutomaticRetries: 10,
          }
          expect(calculateBackoffDelay(retry, config, () => random)).toBe(
            referenceBackoff(retry, base, maximum, multiplier, jitter, random),
          )
        },
      ),
      { numRuns: 300 },
    )
  })
})
