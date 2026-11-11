import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Category,
  IncomeV2,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrenceV2,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import {
  SyncCoordinator,
  SyncFailure,
  type RemoteEntityChange,
  type RemoteSyncGateway,
} from '@application/services/SyncCoordinator'
import {
  SyncOrchestrator,
  type SyncScheduler,
} from '@application/services/SyncOrchestrator'
import { validatePeriodResolutionChoices } from '@application/services/PeriodOverlapResolution'
import { GetFinancialSnapshot } from '@application/use-cases/dashboard/GetFinancialSnapshot'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieBalanceAnchorRepository } from '@infrastructure/local/repositories/DexieBalanceAnchorRepository'
import { DexieExpenseRepository } from '@infrastructure/local/repositories/DexieExpenseRepository'
import { DexieIncomeRepository } from '@infrastructure/local/repositories/DexieIncomeRepository'
import { DexiePeriodRepository } from '@infrastructure/local/repositories/DexiePeriodRepository'
import { DexieRecurringPaymentOccurrenceRepository } from '@infrastructure/local/repositories/DexieRecurringPaymentOccurrenceRepository'
import { PeriodResolutionNotice } from '@presentation/components/PeriodResolutionNotice'
import { ApplyPeriodOverlapResolution } from './ApplyPeriodOverlapResolution'
import { DexieSyncQueueObserver } from './DexieSyncQueueObserver'
import { DexieSyncStore } from './DexieSyncStore'

// Synthetic IDs only. Ordering is explicit and independent of random UUIDs.
const id = (n: number) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER = id(1)
const LEGACY = id(2)
const JULY = id(3)
const AUGUST = id(4)
const SEPTEMBER = id(5)
const INCOME = id(6)
const PAYMENT = id(7)
const OCCURRENCE = id(8)
const SETTINGS = id(9)
const CATEGORY = id(10)
const LOCAL_TIME = '2026-07-31T22:00:00.000Z'
const REMOTE_TIME = '2026-09-08T00:00:00.000Z'
const NOW = '2026-09-09T00:00:00.000Z'
const base = {
  ownerId: OWNER,
  createdAt: LOCAL_TIME,
  updatedAt: LOCAL_TIME,
  deletedAt: null,
  syncStatus: 'pending' as const,
}
const period = (
  periodId: string,
  startDate: string,
  endDate: string,
): Period => ({
  ...base,
  id: periodId,
  type: 'monthly',
  startDate,
  endDate,
  syncStatus: 'synced',
})
const canonical = [
  period(JULY, '2026-07-01', '2026-07-31'),
  period(AUGUST, '2026-08-01', '2026-08-31'),
  period(SEPTEMBER, '2026-09-01', '2026-09-30'),
]
const legacy: Period = {
  ...period(LEGACY, '2026-07-31', '2026-08-31'),
  syncStatus: 'pending',
}
const income: IncomeV2 = {
  ...base,
  id: INCOME,
  periodId: LEGACY,
  amount: 300000,
  description: 'Synthetic acceptance income',
  date: '2026-07-31',
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: LOCAL_TIME,
}
const payment: RecurringPayment = {
  ...base,
  id: PAYMENT,
  name: 'Synthetic acceptance commitment',
  amount: 5000,
  frequency: 'monthly',
  dueDate: '2026-07-13',
  endDate: null,
  categoryId: CATEGORY,
  status: 'active',
}
const occurrence: RecurringPaymentOccurrenceV2 = {
  ...base,
  id: OCCURRENCE,
  periodId: LEGACY,
  recurringPaymentId: PAYMENT,
  dueDate: '2026-08-13',
  status: 'pending',
  transactionId: null,
  amount: 5000,
}
const category: Category = {
  ...base,
  id: CATEGORY,
  name: 'Acceptance',
  normalizedName: 'acceptance',
  color: '#1267d6',
  icon: null,
  isSystem: false,
  syncStatus: 'synced',
}
const settings: UserSettings = {
  id: SETTINGS,
  ownerId: OWNER,
  activePeriodId: LEGACY,
  currency: 'MXN',
  theme: 'dark',
  createdAt: LOCAL_TIME,
  updatedAt: LOCAL_TIME,
}

const databases = new Set<GastoClaroDB>()
const orchestrators = new Set<SyncOrchestrator>()
afterEach(async () => {
  cleanup()
  for (const orchestrator of orchestrators) orchestrator.stop()
  orchestrators.clear()
  for (const db of databases) await db.delete()
  databases.clear()
})

function database(suffix: string) {
  // fake-indexeddb (the repository's existing test backend), never browser storage.
  const db = new GastoClaroDB(`test-period-overlap-real-incident-${suffix}`)
  databases.add(db)
  return db
}

function financial(db: GastoClaroDB) {
  return new GetFinancialSnapshot(
    new DexiePeriodRepository(db, OWNER),
    new DexieBalanceAnchorRepository(db, OWNER),
    new DexieIncomeRepository(db, OWNER),
    new DexieExpenseRepository(db, OWNER),
    new DexieRecurringPaymentOccurrenceRepository(db, OWNER),
    { now: () => NOW },
  ).execute()
}

function operation(
  entityType: SyncOperation['entityType'],
  record: { id: string },
  sequence: number,
): SyncOperation {
  return {
    operationId: id(100 + sequence),
    ownerId: OWNER,
    entityType,
    entityId: record.id,
    operationType: entityType === 'userSettings' ? 'update' : 'create',
    payload: JSON.stringify(record),
    createdAt: `2026-07-31T22:01:0${sequence}.000Z`,
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
  }
}

/** Only the remote transport is fake: persistent client writes use the real store. */
function remoteTransport() {
  const rows = new Map<string, RemoteEntityChange>()
  const put = (change: RemoteEntityChange) =>
    rows.set(
      `${change.entityType}:${change.record.id}`,
      structuredClone(change),
    )
  canonical.forEach((record) => put({ entityType: 'period', record }))
  put({ entityType: 'category', record: category })
  put({
    entityType: 'userSettings',
    record: {
      ...settings,
      activePeriodId: AUGUST,
      theme: 'light',
      updatedAt: REMOTE_TIME,
    },
  })
  const events: string[] = []
  const processed = new Map<string, number>()
  const uploaded: SyncOperation[] = []
  const currentSettings = () => {
    const row = rows.get(`userSettings:${SETTINGS}`)!
    if (row.entityType !== 'userSettings')
      throw new Error('Invalid fixture settings')
    return structuredClone(row.record)
  }
  const gateway: RemoteSyncGateway = {
    verifyAuthenticatedOwner: async (owner) => {
      expect(owner).toBe(OWNER)
    },
    fetchCanonicalDefaults: async () => {
      events.push('defaults')
      return {
        periods: structuredClone(canonical),
        categories: [structuredClone(category)],
        userSettings: currentSettings(),
      }
    },
    findEquivalentPeriod: async (_owner, candidate) => {
      events.push('equivalent-empty')
      expect(candidate).toMatchObject({
        id: LEGACY,
        startDate: '2026-07-31',
        endDate: '2026-08-31',
      })
      return null
    },
    applyOperation: async (queued) => {
      events.push(`upload:${queued.entityType}`)
      if (queued.entityType === 'period' && queued.entityId === LEGACY) {
        throw new SyncFailure(
          'conflict',
          'Synthetic period overlap',
          '23P01',
          false,
          { constraintName: 'periods_no_overlap_per_user' },
        )
      }
      const result = {
        entityUpdatedAt: NOW,
        relatedEntityId: null,
        relatedUpdatedAt: null,
      }
      if (processed.has(queued.operationId))
        return { ...result, status: 'already_processed' }
      const record = JSON.parse(queued.payload)
      expect(record.ownerId).toBe(OWNER)
      expect(JSON.stringify(record)).not.toContain(LEGACY)
      // Discriminant comes from the real persisted queue; the fake models the RPC boundary.
      put({
        entityType: queued.entityType,
        record: {
          ...record,
          updatedAt: NOW,
          ...('syncStatus' in record ? { syncStatus: 'synced' } : {}),
        },
      } as RemoteEntityChange)
      processed.set(queued.operationId, 1)
      uploaded.push(structuredClone(queued))
      return { ...result, status: 'applied' }
    },
    downloadPage: async (owner, entityType, cursor, limit) => {
      events.push(`download:${entityType}`)
      return structuredClone(
        [...rows.values()]
          .filter(
            (row) =>
              row.entityType === entityType && row.record.ownerId === owner,
          )
          .sort(
            (a, b) =>
              a.record.updatedAt.localeCompare(b.record.updatedAt) ||
              a.record.id.localeCompare(b.record.id),
          )
          .filter(
            (row) =>
              cursor.lastUpdatedAt === null ||
              row.record.updatedAt > cursor.lastUpdatedAt ||
              (row.record.updatedAt === cursor.lastUpdatedAt &&
                row.record.id > (cursor.lastEntityId ?? '')),
          )
          .slice(0, limit),
      )
    },
  }
  return {
    gateway,
    rows,
    events,
    processed,
    uploaded,
    readPeriodResolutionContext: async () => ({
      periods: structuredClone(canonical),
      settings: currentSettings(),
      budgets: [],
    }),
  }
}

function runtime(
  db: GastoClaroDB,
  remote: ReturnType<typeof remoteTransport>,
  afterApply: () => Promise<void> = async () => {},
) {
  const service = new ApplyPeriodOverlapResolution(db, remote)
  const coordinator = new SyncCoordinator(
    new DexieSyncStore(db),
    remote.gateway,
    () => NOW,
    service,
  )
  const sync = vi.fn((owner: string) => coordinator.fullSync(owner))
  const resolve = vi.fn(
    async (...args: Parameters<SyncCoordinator['resolvePeriodOverlap']>) => {
      await coordinator.resolvePeriodOverlap(...args)
      // Observes the real committed transaction before returning to automatic resume.
      await afterApply()
    },
  )
  const timers = new Map<number, () => void>()
  let sequence = 0
  const scheduler: SyncScheduler = {
    now: () => Date.parse(NOW),
    setTimeout: (callback) => {
      timers.set(++sequence, callback)
      return sequence
    },
    clearTimeout: (timer) => {
      timers.delete(timer as number)
    },
  }
  const orchestrator = new SyncOrchestrator(
    { sync, resolvePeriodOverlap: resolve },
    new DexieSyncQueueObserver(db),
    { isOnline: () => true, subscribe: () => () => {} },
    scheduler,
  )
  orchestrators.add(orchestrator)
  return { service, coordinator, sync, resolve, orchestrator, timers }
}

async function seed(suffix: string) {
  const db = database(suffix)
  await db.periods.add(legacy)
  await db.categories.add(category)
  await db.incomes.add(income)
  await db.recurringPayments.add(payment)
  await db.recurringPaymentOccurrences.add(occurrence)
  await db.userSettings.add(settings)
  await db.syncOperations.bulkAdd([
    operation('period', legacy, 0),
    operation('income', income, 1),
    operation('recurringPayment', payment, 2),
    operation('recurringPaymentOccurrence', occurrence, 3),
    operation('userSettings', settings, 4),
  ])
  expect(await db.syncOperations.count()).toBe(5)
  expect((await financial(db)).currentBalanceCents).toBe(300000)
  return { db, remote: remoteTransport() }
}

async function dump(db: GastoClaroDB) {
  return db.transaction('r', db.tables, () =>
    Promise.all(db.tables.map((table) => table.toArray())),
  )
}

async function counts(db: GastoClaroDB) {
  return Promise.all(
    [
      db.expenses,
      db.incomes,
      db.recurringPaymentOccurrences,
      db.recurringPayments,
    ].map((table) => table.filter((row) => row.deletedAt === null).count()),
  )
}

async function assertCanonical(db: GastoClaroDB) {
  expect(await db.periods.get(LEGACY)).toBeUndefined()
  expect((await db.periods.toArray()).map((p) => p.id).sort()).toEqual(
    [JULY, AUGUST, SEPTEMBER].sort(),
  )
  expect(await counts(db)).toEqual([0, 1, 1, 1])
  expect(await db.incomes.get(INCOME)).toMatchObject({
    ...income,
    periodId: JULY,
    syncStatus: 'synced',
    updatedAt: NOW,
  })
  expect(await db.recurringPaymentOccurrences.get(OCCURRENCE)).toMatchObject({
    ...occurrence,
    periodId: AUGUST,
    syncStatus: 'synced',
    updatedAt: NOW,
  })
  expect(await db.recurringPayments.get(PAYMENT)).toEqual({
    ...payment,
    syncStatus: 'synced',
    updatedAt: NOW,
  })
  expect(await db.userSettings.get(SETTINGS)).toMatchObject({
    activePeriodId: AUGUST,
    currency: 'MXN',
    theme: 'dark',
  })
  expect(await db.syncOperations.count()).toBe(0)
  expect(JSON.stringify(await dump(db))).not.toContain(LEGACY)
  expect((await financial(db)).currentBalanceCents).toBe(300000)
}

async function flushDatabaseNotifications(db: GastoClaroDB) {
  // Allow real IndexedDB/liveQuery tasks to settle; never advance fake timers over IDB.
  await db.syncOperations.toArray()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await db.syncOperations.toArray()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('Period overlap real incident — isolated deterministic acceptance', () => {
  it('preserves 300000 cents through real apply, automatic resume, reopen and client B', async () => {
    const { db, remote } = await seed('client-a')
    const beforeCounts = await counts(db)
    const beforeBalance = (await financial(db)).currentBalanceCents
    let afterApplyBalance: number | null = null
    const r = runtime(db, remote, async () => {
      expect(await db.incomes.get(INCOME)).toEqual({
        ...income,
        periodId: JULY,
      })
      expect(await db.recurringPaymentOccurrences.get(OCCURRENCE)).toEqual({
        ...occurrence,
        periodId: AUGUST,
      })
      expect(await db.recurringPayments.get(PAYMENT)).toEqual(payment)
      expect(await db.userSettings.get(SETTINGS)).toMatchObject({
        activePeriodId: AUGUST,
        theme: 'dark',
        currency: 'MXN',
      })
      expect(await db.periods.get(LEGACY)).toBeUndefined()
      expect(await db.syncOperations.get(id(100))).toBeUndefined()
      expect(await db.syncOperations.count()).toBe(4)
      expect(JSON.stringify(await dump(db))).not.toContain(LEGACY)
      expect(remote.processed.size).toBe(0)
      expect(remote.events.some((e) => e.startsWith('download:'))).toBe(false)
      afterApplyBalance = (await financial(db)).currentBalanceCents
      expect(afterApplyBalance).toBe(beforeBalance)
      expect(afterApplyBalance).toBe(300000)
    })
    r.orchestrator.start(OWNER)
    await vi.waitFor(() =>
      expect(r.orchestrator.getState().status).toBe('requiresPeriodResolution'),
    )
    expect(r.sync).toHaveBeenCalledTimes(1)
    expect(remote.events).toEqual([
      'defaults',
      'upload:period',
      'equivalent-empty',
    ])
    expect(await db.syncOperations.count()).toBe(5)
    const marked = (await db.syncOperations.get(id(100)))!
    expect(marked).toMatchObject({ status: 'error', retryCount: 1 })
    const beforePreview = await dump(db)
    const preview = await r.service.prepare(marked)
    expect(preview.plan.classification).toBe('TRUE_OVERLAP')
    expect(preview.plan.remotePeriods.map((p) => p.id)).toEqual([JULY, AUGUST])
    expect(preview.plan.dependencies).toHaveLength(2)
    expect(
      validatePeriodResolutionChoices(
        preview.plan,
        {},
        preview.existingBudgets,
      ),
    ).toEqual({
      [`income:${INCOME}`]: JULY,
      [`recurringPaymentOccurrence:${OCCURRENCE}`]: AUGUST,
    })
    expect(preview.navigation.kind).not.toBe('REQUIRES_SELECTION')
    if (preview.navigation.kind === 'REQUIRES_SELECTION')
      throw new Error('Unexpected manual selection')
    expect(preview.navigation.settings).toMatchObject({
      activePeriodId: AUGUST,
      theme: 'dark',
      currency: 'MXN',
    })
    expect(await dump(db)).toEqual(beforePreview)
    expect(await db.periods.get(LEGACY)).toEqual(legacy)
    expect((await db.incomes.get(INCOME))?.periodId).toBe(LEGACY)
    expect(
      (await db.recurringPaymentOccurrences.get(OCCURRENCE))?.periodId,
    ).toBe(LEGACY)
    expect((await financial(db)).currentBalanceCents).toBe(300000)
    await flushDatabaseNotifications(db)
    expect(r.sync).toHaveBeenCalledTimes(1)
    expect(r.timers.size).toBe(0)

    // One confirmation; the orchestrator, not this test, starts the second sync.
    await r.orchestrator.resolvePeriodOverlap(preview.operationId, {
      revision: preview.revision,
      destinations: {},
    })
    expect(r.resolve).toHaveBeenCalledTimes(1)
    expect(afterApplyBalance).toBe(300000)
    expect(r.orchestrator.getState()).toMatchObject({
      status: 'up_to_date',
      pendingCount: 0,
    })
    expect(r.orchestrator.getState().lastResult?.failed).toBe(0)
    expect(r.sync).toHaveBeenCalledTimes(2)
    await flushDatabaseNotifications(db)
    expect(r.sync).toHaveBeenCalledTimes(2)
    expect(r.timers.size).toBe(0)
    expect(await counts(db)).toEqual(beforeCounts)
    await assertCanonical(db)
    expect([...remote.processed.entries()].sort()).toEqual(
      [1, 2, 3, 4].map((n) => [id(100 + n), 1]),
    )
    expect(remote.processed.has(id(100))).toBe(false)
    expect(remote.rows.has(`period:${LEGACY}`)).toBe(false)
    expect(
      [...remote.rows.values()].filter((row) => row.entityType === 'period'),
    ).toHaveLength(3)
    for (const [kind, entityId, periodId] of [
      ['income', INCOME, JULY],
      ['recurringPaymentOccurrence', OCCURRENCE, AUGUST],
    ] as const) {
      const row = remote.rows.get(`${kind}:${entityId}`)!
      expect(row.record).toMatchObject({ id: entityId, periodId })
      expect(
        [...remote.rows.values()].filter(
          (candidate) => candidate.entityType === kind,
        ),
      ).toHaveLength(1)
    }
    expect(
      [...remote.rows.values()].filter(
        (row) => row.entityType === 'recurringPayment',
      ),
    ).toHaveLength(1)
    expect(remote.rows.get(`userSettings:${SETTINGS}`)?.record).toMatchObject({
      activePeriodId: AUGUST,
      theme: 'dark',
    })
    const remoteBeforeReload = structuredClone([...remote.rows.entries()])
    r.orchestrator.stop()
    db.close()
    const reopened = database('client-a')
    expect(reopened).not.toBe(db)
    await reopened.open()
    await assertCanonical(reopened)
    const reloadRuntime = runtime(reopened, remote)
    reloadRuntime.orchestrator.start(OWNER)
    await vi.waitFor(() =>
      expect(reloadRuntime.orchestrator.getState().status).toBe('up_to_date'),
    )
    await flushDatabaseNotifications(reopened)
    expect(reloadRuntime.sync).toHaveBeenCalledTimes(1)
    expect(reloadRuntime.orchestrator.getState().lastResult).toMatchObject({
      failed: 0,
      uploaded: 0,
    })
    expect(
      reloadRuntime.orchestrator.getState().lastResult?.periodResolution,
    ).toBeUndefined()
    await assertCanonical(reopened)
    expect([...remote.rows.entries()]).toEqual(remoteBeforeReload)
    expect(remote.uploaded).toHaveLength(4)
    expect(remote.events.filter((e) => e === 'upload:period')).toHaveLength(1)
    reloadRuntime.orchestrator.stop()

    const clientB = database('client-b')
    expect(await clientB.incomes.count()).toBe(0)
    const b = runtime(clientB, remote)
    b.orchestrator.start(OWNER)
    await vi.waitFor(() =>
      expect(b.orchestrator.getState().status).toBe('up_to_date'),
    )
    expect(b.orchestrator.getState().lastResult?.failed).toBe(0)
    await assertCanonical(clientB)
    expect(remote.uploaded).toHaveLength(4)
    expect([...remote.rows.entries()]).toEqual(remoteBeforeReload)
  })

  it('Cancel leaves the real temporary database unchanged and reconstructs without another POST', async () => {
    const { db, remote } = await seed('cancel')
    const r = runtime(db, remote)
    r.orchestrator.start(OWNER)
    await vi.waitFor(() =>
      expect(r.orchestrator.getState().status).toBe('requiresPeriodResolution'),
    )
    const before = await dump(db)
    const user = userEvent.setup()
    render(
      createElement(PeriodResolutionNotice, {
        sync: {
          ...r.orchestrator.getState(),
          isAvailable: true,
          syncNow: () => r.orchestrator.syncNow(),
          resolvePeriodOverlap: (operationId, choice) =>
            r.orchestrator.resolvePeriodOverlap(operationId, choice),
        },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toBeEnabled()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(await dump(db)).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(r.resolve).not.toHaveBeenCalled()
    expect(await dump(db)).toEqual(before)
    expect(await db.syncOperations.count()).toBe(5)
    expect((await financial(db)).currentBalanceCents).toBe(300000)
    r.orchestrator.stop()
    const rebuilt = runtime(db, remote)
    const result = await rebuilt.coordinator.fullSync(OWNER)
    expect(result.periodResolution?.plan.classification).toBe('TRUE_OVERLAP')
    expect(result.failed).toBe(0)
    expect(remote.events.filter((e) => e.startsWith('upload:'))).toEqual([
      'upload:period',
    ])
    expect(remote.events.some((e) => e.startsWith('download:'))).toBe(false)
    expect(await dump(db)).toEqual(before)
  })
})
