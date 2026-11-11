import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CategoryBudget } from '@domain/entities'
import type { Database } from '@infrastructure/remote/database.types'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieCategoryBudgetRepository } from '@infrastructure/local/repositories/DexieCategoryBudgetRepository'
import {
  SyncCoordinator,
  SyncFailure,
  type RemoteSyncGateway,
} from '@application/services/SyncCoordinator'
import { DexieSyncStore } from './DexieSyncStore'
import {
  SupabaseSyncGateway,
  classifyRemoteFailure,
} from './SupabaseSyncGateway'
import { deserializeRemoteChange } from './SyncMapper'

const owner = '10000000-0000-4000-8000-000000000001'
const period = '20000000-0000-4000-8000-000000000002'
const category = '30000000-0000-4000-8000-000000000003'
const a = '40000000-0000-4000-8000-000000000004'
const b = '50000000-0000-4000-8000-000000000005'
const old = '2026-09-01T10:00:00.000Z'
const serverTime = '2026-09-01T10:01:00.000Z'
const newer = '2026-09-01T10:02:00.000Z'
const deleted = '2026-09-01T10:03:00.000Z'
const dbs: GastoClaroDB[] = []
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})
const budget = (
  id: string,
  amount: number,
  updatedAt = old,
): CategoryBudget => ({
  id,
  ownerId: owner,
  periodId: period,
  categoryId: category,
  amount,
  createdAt: old,
  updatedAt,
  deletedAt: null,
  syncStatus: 'pending',
})
const row = (v: CategoryBudget) => ({
  id: v.id,
  user_id: v.ownerId,
  period_id: v.periodId,
  category_id: v.categoryId,
  amount: v.amount,
  created_at: v.createdAt,
  updated_at: v.updatedAt,
  deleted_at: v.deletedAt,
})

// Contract fake: models the audited unique-active index, RPC transaction rollback,
// strict incoming.updated_at > stored.updated_at and server timestamp floor.
// Production code exercised: actual gateway + coordinator + mapper + both Dexie stores.
function remoteServer(constraint = 'category_budgets_active_unique') {
  const records = new Map<string, CategoryBudget>()
  const processed = new Set<string>()
  const collisions: string[] = []
  const lookups: Record<string, unknown>[] = []
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'fetch_sync_changes')
      return {
        error: null,
        status: 200,
        data:
          args.p_entity_type === 'categoryBudget'
            ? [...records.values()]
                .filter(
                  (v) =>
                    !args.p_updated_at ||
                    v.updatedAt > String(args.p_updated_at) ||
                    (v.updatedAt === args.p_updated_at &&
                      v.id > String(args.p_entity_id)),
                )
                .sort(
                  (x, y) =>
                    x.updatedAt.localeCompare(y.updatedAt) ||
                    x.id.localeCompare(y.id),
                )
                .map(row)
            : [],
      }
    const mutation = (status: string, updatedAt: string | null) => ({
      error: null,
      status: 200,
      data: {
        status,
        entity_updated_at: updatedAt,
        related_entity_id: null,
        related_updated_at: null,
      },
    })
    const op = String(args.p_operation_id)
    if (processed.has(op)) return mutation('already_processed', null)
    const change = deserializeRemoteChange('categoryBudget', args.p_payload)
    if (change.entityType !== 'categoryBudget')
      throw new Error('Unexpected entity')
    const incoming = change.record
    if (
      incoming.deletedAt === null &&
      [...records.values()].some(
        (v) =>
          v.id !== incoming.id &&
          v.deletedAt === null &&
          v.ownerId === incoming.ownerId &&
          v.periodId === incoming.periodId &&
          v.categoryId === incoming.categoryId,
      )
    ) {
      collisions.push(op)
      return {
        data: null,
        status: 409,
        error: {
          code: '23505',
          message: `duplicate key value violates unique constraint "${constraint}"`,
        },
      }
    }
    const existing = records.get(incoming.id)
    processed.add(op)
    if (existing && incoming.updatedAt <= existing.updatedAt)
      return mutation('remote_wins', existing.updatedAt)
    const saved = {
      ...incoming,
      updatedAt:
        incoming.updatedAt > serverTime ? incoming.updatedAt : serverTime,
    }
    records.set(saved.id, saved)
    return mutation('applied', saved.updatedAt)
  })
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {}
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((key: string, value: unknown) => {
        filters[key] = value
        return chain
      }),
      is: vi.fn((key: string, value: unknown) => {
        filters[key] = value
        return chain
      }),
      maybeSingle: vi.fn(async () => {
        lookups.push({ ...filters })
        if (table !== 'category_budgets') throw new Error('Unexpected lookup')
        const matches = [...records.values()]
          .map(row)
          .filter((v) =>
            Object.entries(filters).every(
              ([key, value]) => v[key as keyof typeof v] === value,
            ),
          )
        return { data: matches[0] ?? null, error: null, status: 200 }
      }),
    }
    return chain
  })
  const gateway = new SupabaseSyncGateway({
    rpc,
    from,
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: owner } },
        error: null,
      })),
    },
  } as unknown as SupabaseClient<Database>)
  const remote: RemoteSyncGateway = {
    verifyAuthenticatedOwner: gateway.verifyAuthenticatedOwner.bind(gateway),
    findEquivalentPeriod: gateway.findEquivalentPeriod.bind(gateway),
    findEquivalentCategoryBudget:
      gateway.findEquivalentCategoryBudget.bind(gateway),
    applyOperation: gateway.applyOperation.bind(gateway),
    downloadPage: gateway.downloadPage.bind(gateway),
  }
  return { records, processed, collisions, lookups, remote }
}
function device(
  remote: RemoteSyncGateway,
  step?: (step: string) => void,
  operationIds?: string[],
  clock = () => deleted,
) {
  const db = new GastoClaroDB(`budget-collision-${crypto.randomUUID()}`)
  dbs.push(db)
  const repo = new DexieCategoryBudgetRepository(db, owner, {
    clock: { now: clock },
    ...(operationIds
      ? {
          ids: {
            generate: () => {
              const id = operationIds.shift()
              if (!id) throw new Error('Missing deterministic operation ID')
              return id
            },
          },
        }
      : {}),
  })
  const local = new DexieSyncStore(db, undefined, step)
  return {
    db,
    repo,
    local,
    sync: new SyncCoordinator(local, remote, () => deleted),
  }
}
describe('category budget semantic collision', () => {
  it.each([
    [old, 100000],
    [serverTime, 100000],
    [newer, 110000],
  ] as const)(
    'converges original version %s to amount %i and continues queue/download',
    async (version, amount) => {
      const server = remoteServer()
      const A = device(server.remote)
      const B = device(server.remote)
      await A.repo.upsert(budget(a, 100000))
      await B.repo.upsert(budget(b, 110000, version))
      expect((await A.sync.fullSync(owner)).failed).toBe(0)
      const extra = {
        ...budget(crypto.randomUUID(), 5000, newer),
        createdAt: newer,
        categoryId: crypto.randomUUID(),
      }
      await B.repo.upsert(extra)
      const result = await B.sync.fullSync(owner)
      expect(result.failed).toBe(0)
      expect(result.downloaded).toBeGreaterThan(0)
      expect(server.collisions).toHaveLength(1)
      expect(server.lookups).toEqual([
        {
          user_id: owner,
          period_id: period,
          category_id: category,
          deleted_at: null,
        },
      ])
      expect(await B.db.syncOperations.count()).toBe(0)
      expect(await B.db.categoryBudgets.get(b)).toBeUndefined()
      expect(
        await B.repo.findByPeriodAndCategory(period, category),
      ).toMatchObject({ id: a, amount })
      expect(server.records.get(extra.id)?.amount).toBe(5000)
      expect((await A.sync.fullSync(owner)).failed).toBe(0)
      for (const d of [A, B]) {
        d.db.close()
        await d.db.open()
        expect(
          await d.repo.findByPeriodAndCategory(period, category),
        ).toMatchObject({ id: a, amount })
        expect(
          (await d.repo.findByPeriod(period)).filter(
            (v) => v.categoryId === category,
          ),
        ).toHaveLength(1)
      }
    },
  )
  it.each(['delete-first', 'create-first', 'distinct-timestamps'] as const)(
    'pending delete same timestamp: %s',
    async (order) => {
      const server = remoteServer()
      const A = device(server.remote)
      const low = '60000000-0000-4000-8000-000000000001'
      const high = '60000000-0000-4000-8000-000000000002'
      let time = order === 'distinct-timestamps' ? newer : deleted
      const B = device(
        server.remote,
        undefined,
        order === 'create-first' ? [low, high] : [high, low],
        () => time,
      )
      await A.repo.upsert(budget(a, 100000))
      await A.sync.fullSync(owner)
      await B.repo.upsert(budget(b, 110000, newer))
      time = deleted
      await B.repo.delete(b)
      expect(
        (await B.local.findUploadable(owner)).map((op) => op.operationType),
      ).toEqual(
        order === 'delete-first' ? ['delete', 'create'] : ['create', 'delete'],
      )
      expect((await B.sync.fullSync(owner)).failed).toBe(0)
      expect((await A.sync.fullSync(owner)).failed).toBe(0)
      for (const d of [A, B]) {
        d.db.close()
        await d.db.open()
        expect(await d.repo.findByPeriod(period)).toEqual([])
        expect((await d.db.categoryBudgets.get(a))?.deletedAt).toBe(deleted)
        expect(await d.db.syncOperations.count()).toBe(0)
      }
    },
  )
  it.each(['before-commit', 'lost-ack'] as const)(
    'preserves delete and retries the same operation after %s',
    async (failure) => {
      const server = remoteServer()
      const A = device(server.remote)
      await A.repo.upsert(budget(a, 100000))
      await A.sync.fullSync(owner)
      let fail = true
      const attempts: string[] = []
      const remote: RemoteSyncGateway = {
        ...server.remote,
        applyOperation: async (operation) => {
          if (
            operation.entityId === a &&
            operation.operationType === 'delete'
          ) {
            attempts.push(operation.operationId)
            if (fail) {
              fail = false
              if (failure === 'lost-ack')
                await server.remote.applyOperation(operation)
              throw new SyncFailure(
                'network',
                'Synthetic connection failure',
                null,
                true,
              )
            }
          }
          return server.remote.applyOperation(operation)
        },
      }
      const createId = '61000000-0000-4000-8000-000000000003'
      const collisionId = '61000000-0000-4000-8000-000000000002'
      const B = device(remote, undefined, [
        createId,
        collisionId,
        '61000000-0000-4000-8000-000000000001',
      ])
      await B.repo.upsert(budget(b, 110000, newer))
      await B.repo.upsert(budget(b, 120000, newer))
      await B.repo.delete(b)
      expect((await B.sync.fullSync(owner)).failed).toBe(1)
      const queued = await B.local.findUploadable(owner)
      expect(queued).toHaveLength(1)
      expect(queued[0]).toMatchObject({
        operationId: collisionId,
        entityId: a,
        operationType: 'delete',
        status: 'error',
        retryCount: 1,
      })
      expect(JSON.parse(queued[0]!.payload)).toMatchObject({
        deletedAt: deleted,
        updatedAt: deleted,
        amount: 120000,
      })
      B.db.close()
      await B.db.open()
      expect(await B.repo.findByPeriod(period)).toEqual([])
      expect((await B.sync.fullSync(owner)).failed).toBe(0)
      expect(attempts).toEqual([collisionId, collisionId])
      expect((await A.sync.fullSync(owner)).failed).toBe(0)
      for (const d of [A, B]) {
        expect(await d.repo.findByPeriod(period)).toEqual([])
        expect(await d.db.categoryBudgets.get(a)).toMatchObject({
          deletedAt: deleted,
        })
        expect(await d.db.syncOperations.count()).toBe(0)
      }
    },
  )
  it('keeps an explicit recreation under a new ID separate from the alias tombstone', async () => {
    const server = remoteServer()
    const A = device(server.remote)
    await A.repo.upsert(budget(a, 100000))
    await A.sync.fullSync(owner)
    let time = deleted
    const B = device(
      server.remote,
      undefined,
      [
        '62000000-0000-4000-8000-000000000002',
        '62000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000003',
      ],
      () => time,
    )
    await B.repo.upsert(budget(b, 110000, newer))
    await B.repo.delete(b)
    time = '2026-09-01T10:04:00.000Z'
    const recreated = budget(
      '52000000-0000-4000-8000-000000000005',
      130000,
      time,
    )
    await B.repo.upsert(recreated)
    expect((await B.sync.fullSync(owner)).failed).toBe(0)
    expect((await A.sync.fullSync(owner)).failed).toBe(0)
    for (const d of [A, B]) {
      d.db.close()
      await d.db.open()
      expect(await d.repo.findByPeriod(period)).toMatchObject([
        { id: recreated.id, amount: 130000 },
      ])
      expect(await d.db.categoryBudgets.get(a)).toMatchObject({
        deletedAt: deleted,
      })
      expect(await d.db.syncOperations.count()).toBe(0)
    }
  })
  it('rolls back tombstone coalescing without losing any pending intent', async () => {
    const server = remoteServer()
    const A = device(server.remote)
    await A.repo.upsert(budget(a, 100000))
    await A.sync.fullSync(owner)
    const B = device(server.remote, undefined, [
      '63000000-0000-4000-8000-000000000001',
      '63000000-0000-4000-8000-000000000002',
    ])
    await B.repo.upsert(budget(b, 110000, newer))
    await B.repo.delete(b)
    const beforeEntity = await B.db.categoryBudgets.toArray()
    const beforeQueue = await B.db.syncOperations.toArray()
    const store = new DexieSyncStore(B.db, undefined, () => {
      throw new Error('injected rollback')
    })
    await expect(
      store.reconcileEquivalentCategoryBudget(
        (await store.findUploadable(owner))[0]!,
        server.records.get(a)!,
      ),
    ).rejects.toThrow('injected rollback')
    expect(await B.db.categoryBudgets.toArray()).toEqual(beforeEntity)
    expect(await B.db.syncOperations.toArray()).toEqual(beforeQueue)
  })
  it('does not absorb unrelated 23505 or discard the local intent', async () => {
    const server = remoteServer('category_budgets_pkey')
    const A = device(server.remote)
    const B = device(server.remote)
    await A.repo.upsert(budget(a, 100000))
    await A.sync.fullSync(owner)
    await B.repo.upsert(budget(b, 110000, newer))
    expect((await B.sync.fullSync(owner)).failed).toBe(1)
    expect(server.lookups).toHaveLength(0)
    expect(await B.repo.findById(b)).toMatchObject({ amount: 110000 })
    expect(await B.db.syncOperations.count()).toBe(1)
  })
  it('rolls back all ID/queue rewrites if reconciliation fails', async () => {
    const server = remoteServer()
    const A = device(server.remote)
    const B = device(server.remote, () => {
      throw new Error('injected rollback')
    })
    await A.repo.upsert(budget(a, 100000))
    await A.sync.fullSync(owner)
    await B.repo.upsert(budget(b, 110000, newer))
    expect((await B.sync.fullSync(owner)).failed).toBe(1)
    expect(await B.db.categoryBudgets.get(a)).toBeUndefined()
    expect(await B.repo.findById(b)).toMatchObject({ amount: 110000 })
    expect((await B.db.syncOperations.toArray())[0]?.entityId).toBe(b)
  })
  it('classifies only the exact constraint and SQLSTATE without retaining details in the user message', () => {
    const known = classifyRemoteFailure(
      {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "category_budgets_active_unique"',
      },
      'safe',
    )
    expect(known.constraintName).toBe('category_budgets_active_unique')
    expect(known.message).toBe('safe')
    for (const error of [
      { code: '23505', message: 'other category_budgets_active_unique' },
      {
        code: '23514',
        message:
          'duplicate key value violates unique constraint "category_budgets_active_unique"',
      },
    ])
      expect(classifyRemoteFailure(error, 'safe').constraintName).toBeNull()
  })
})
