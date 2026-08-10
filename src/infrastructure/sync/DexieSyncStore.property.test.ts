import Dexie from 'dexie'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Period, SyncCursor, SyncOperation } from '@domain/entities'
import { resolveLastWriteWins } from '@domain/rules'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexiePeriodRepository,
  DexieSyncOperationRepository,
} from '@infrastructure/local/repositories'
import type { SyncMutationDependencies } from '@infrastructure/local/sync-mutations'
import {
  authenticatedOwnerIdArbitrary,
  cursorRowsArbitrary,
  entityIdArbitrary,
  instantArbitrary,
  periodArbitrary,
  syncOperationArbitrary,
} from './property/arbitraries'
import {
  maxCursor,
  pageAfter,
  referenceWinner,
  sortQueue,
} from './property/models'
import { DexieSyncStore } from './DexieSyncStore'

const RUNS = 150
const ownerId = '10000000-0000-4000-8000-000000000001'

let database: GastoClaroDB
let store: DexieSyncStore

beforeEach(() => {
  database = new GastoClaroDB(`sync-store-property-${crypto.randomUUID()}`)
  store = new DexieSyncStore(database)
})

afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

async function resetDatabase(): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()))
  })
}

function asOwner(operation: SyncOperation, owner: string): SyncOperation {
  return { ...operation, ownerId: owner }
}

function queuedUpdate(record: Period, operationId: string): SyncOperation {
  return {
    operationId,
    ownerId: record.ownerId,
    entityType: 'period',
    entityId: record.id,
    operationType: 'update',
    payload: JSON.stringify(record),
    createdAt: record.updatedAt,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
  }
}

describe('propiedades del almacén Dexie de sincronización', () => {
  it('PBT: devuelve la cola por propietario en orden FIFO total y estable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(syncOperationArbitrary, { maxLength: 80 }),
        authenticatedOwnerIdArbitrary,
        authenticatedOwnerIdArbitrary.filter((other) => other !== ownerId),
        async (generated, selectedOwner, otherOwner) => {
          await resetDatabase()
          const operations = generated.map((operation, index) =>
            asOwner(operation, index % 3 === 0 ? otherOwner : selectedOwner),
          )
          await database.syncOperations.bulkPut(operations)

          expect(await store.findUploadable(selectedOwner)).toEqual(
            sortQueue(
              operations.filter(
                ({ ownerId: candidate }) => candidate === selectedOwner,
              ),
            ),
          )
          expect(
            await new DexieSyncOperationRepository(
              database,
              selectedOwner,
            ).findPending(),
          ).toEqual(
            sortQueue(
              operations.filter(
                (operation) =>
                  operation.ownerId === selectedOwner &&
                  operation.status === 'pending',
              ),
            ),
          )
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('PBT: la paginación por cursor compuesto no omite ni duplica filas', () => {
    fc.assert(
      fc.property(
        cursorRowsArbitrary,
        fc.integer({ min: 1, max: 100 }),
        (rows, pageSize) => {
          let cursor: SyncCursor = { lastUpdatedAt: null, lastEntityId: null }
          const downloaded: typeof rows = []
          while (true) {
            const page = pageAfter(rows, cursor, pageSize)
            if (page.length === 0) break
            downloaded.push(...page)
            const last = page.at(-1)
            if (!last)
              throw new Error('La página generada no tiene último elemento.')
            cursor = { lastUpdatedAt: last.updatedAt, lastEntityId: last.id }
          }
          expect(downloaded).toEqual(rows)
          expect(new Set(downloaded.map(({ id }) => id))).toHaveLength(
            rows.length,
          )
        },
      ),
      { numRuns: 250 },
    )
  })

  it('PBT: el cursor persistido nunca retrocede', async () => {
    await fc.assert(
      fc.asyncProperty(
        instantArbitrary,
        instantArbitrary,
        entityIdArbitrary,
        entityIdArbitrary,
        async (firstAt, secondAt, firstId, secondId) => {
          await resetDatabase()
          const first = { lastUpdatedAt: firstAt, lastEntityId: firstId }
          const second = { lastUpdatedAt: secondAt, lastEntityId: secondId }
          await store.applyRemotePage(ownerId, 'period', [], first)
          await store.applyRemotePage(ownerId, 'period', [], second)
          expect(await store.getCursor(ownerId, 'period')).toEqual(
            maxCursor(first, second),
          )
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('PBT: una operación local pendiente impide que una descarga sobrescriba la entidad', async () => {
    await fc.assert(
      fc.asyncProperty(
        periodArbitrary,
        instantArbitrary,
        fc.uuid(),
        async (generated, remoteUpdatedAt, operationId) => {
          await resetDatabase()
          const local: Period = {
            ...generated,
            ownerId,
            syncStatus: 'pending',
            deletedAt: null,
          }
          const remote: Period = {
            ...local,
            type: local.type === 'monthly' ? 'biweekly' : 'monthly',
            updatedAt: remoteUpdatedAt,
            syncStatus: 'synced',
          }
          await database.periods.put(local)
          await database.syncOperations.put(queuedUpdate(local, operationId))

          const summary = await store.applyRemotePage(
            ownerId,
            'period',
            [{ entityType: 'period', record: remote }],
            { lastUpdatedAt: remote.updatedAt, lastEntityId: remote.id },
          )

          expect(await database.periods.get(local.id)).toEqual(local)
          expect(await database.syncOperations.count()).toBe(1)
          expect(summary.conflicts).toBe(1)
          expect(summary.skipped).toBe(1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('PBT: LWW coincide con el modelo independiente, incluidos tombstones', () => {
    fc.assert(
      fc.property(
        periodArbitrary,
        fc.constantFrom(-1, 0, 1),
        entityIdArbitrary,
        fc.option(instantArbitrary, { nil: null }),
        (local, timestampRelation, remoteId, remoteDeletedAt) => {
          fc.pre(remoteId !== local.id)
          const remoteUpdatedAt = new Date(
            Date.parse(local.updatedAt) + timestampRelation * 1_000,
          ).toISOString()
          const remote: Period = {
            ...local,
            id: remoteId,
            updatedAt: remoteUpdatedAt,
            deletedAt: remoteDeletedAt,
          }
          const winner = resolveLastWriteWins(local, remote)
          expect(winner).toBe(referenceWinner(local, remote))
          if (timestampRelation === 0) {
            expect(winner).toBe(local.id > remote.id ? 'local' : 'remote')
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('PBT: reaplicar una página y un tombstone es estable y no reencola', async () => {
    await fc.assert(
      fc.asyncProperty(
        periodArbitrary,
        fc.integer({ min: 2, max: 12 }),
        async (generated, repetitions) => {
          await resetDatabase()
          const tombstone: Period = {
            ...generated,
            ownerId,
            updatedAt: '2040-01-01T00:00:00.000Z',
            deletedAt: '2040-01-01T00:00:00.000Z',
            syncStatus: 'synced',
          }
          const cursor = {
            lastUpdatedAt: tombstone.updatedAt,
            lastEntityId: tombstone.id,
          }
          for (let index = 0; index < repetitions; index += 1) {
            await store.applyRemotePage(
              ownerId,
              'period',
              [{ entityType: 'period', record: tombstone }],
              cursor,
            )
          }
          expect(await database.periods.get(tombstone.id)).toEqual(tombstone)
          expect(
            await new DexiePeriodRepository(database, ownerId).findById(
              tombstone.id,
            ),
          ).toBeNull()
          expect(await database.syncOperations.count()).toBe(0)
          expect(await store.getCursor(ownerId, 'period')).toEqual(cursor)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('PBT: un tombstone remoto antiguo no elimina una versión local más nueva', async () => {
    await fc.assert(
      fc.asyncProperty(periodArbitrary, async (generated) => {
        await resetDatabase()
        const local: Period = {
          ...generated,
          ownerId,
          updatedAt: '2040-01-01T00:00:00.000Z',
          deletedAt: null,
          syncStatus: 'synced',
        }
        const oldTombstone: Period = {
          ...local,
          updatedAt: '2030-01-01T00:00:00.000Z',
          deletedAt: '2030-01-01T00:00:00.000Z',
        }
        await database.periods.put(local)
        await store.applyRemotePage(
          ownerId,
          'period',
          [{ entityType: 'period', record: oldTombstone }],
          {
            lastUpdatedAt: oldTombstone.updatedAt,
            lastEntityId: oldTombstone.id,
          },
        )
        expect(await database.periods.get(local.id)).toEqual(local)
      }),
      { numRuns: 100 },
    )
  })

  it('PBT: una página inválida revierte entidades y cursor de forma atómica', async () => {
    await fc.assert(
      fc.asyncProperty(periodArbitrary, async (generated) => {
        await resetDatabase()
        const valid: Period = {
          ...generated,
          ownerId,
          syncStatus: 'synced',
        }
        const invalid: Period = {
          ...valid,
          id: crypto.randomUUID(),
          ownerId: crypto.randomUUID(),
        }
        await expect(
          store.applyRemotePage(
            ownerId,
            'period',
            [
              { entityType: 'period', record: valid },
              { entityType: 'period', record: invalid },
            ],
            { lastUpdatedAt: valid.updatedAt, lastEntityId: valid.id },
          ),
        ).rejects.toThrow()
        expect(await database.periods.count()).toBe(0)
        expect(await store.getCursor(ownerId, 'period')).toEqual({
          lastUpdatedAt: null,
          lastEntityId: null,
        })
      }),
      { numRuns: 100 },
    )
  })

  it('PBT: cada acción local crea una sola operación y la eliminación conserva tombstone', async () => {
    await fc.assert(
      fc.asyncProperty(periodArbitrary, async (generated) => {
        await resetDatabase()
        let sequence = 0
        const clockValues = [
          '2026-08-01T10:00:00.000Z',
          '2026-08-01T11:00:00.000Z',
          '2026-08-01T12:00:00.000Z',
        ]
        const dependencies: SyncMutationDependencies = {
          ids: {
            generate: () =>
              `90000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
          },
          clock: {
            now: () => clockValues[Math.min(sequence, 2)] ?? clockValues[2]!,
          },
          origin: 'local-user',
        }
        const repository = new DexiePeriodRepository(
          database,
          ownerId,
          dependencies,
        )
        const created: Period = {
          ...generated,
          id: crypto.randomUUID(),
          ownerId,
          createdAt: clockValues[0]!,
          updatedAt: clockValues[0]!,
          deletedAt: null,
          syncStatus: 'pending',
        }
        await repository.create(created)
        await repository.update({ ...created, updatedAt: clockValues[1]! })
        await repository.delete(created.id)

        const operations = await database.syncOperations
          .orderBy('createdAt')
          .toArray()
        expect(operations.map(({ operationType }) => operationType)).toEqual([
          'create',
          'update',
          'delete',
        ])
        expect(await repository.findById(created.id)).toBeNull()
        expect(
          (await database.periods.get(created.id))?.deletedAt,
        ).not.toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
