import { afterEach, describe, expect, it } from 'vitest'
import type {
  Income,
  Period,
  RecurringPaymentOccurrence,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  PERIOD_RESOLUTION_REQUIRED,
  ResolutionStaleError,
} from '@application/services/PeriodResolutionPort'
import { ApplyPeriodOverlapResolution } from './ApplyPeriodOverlapResolution'
import { DexieSyncStore } from './DexieSyncStore'
import { SyncCoordinator, SyncFailure } from '@application/services/SyncCoordinator'
import { vi } from 'vitest'

const databases: GastoClaroDB[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete()
})
const stamp = '2026-09-01T00:00:00.000Z'
const base = {
  ownerId: 'owner',
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: null,
  syncStatus: 'pending' as const,
}
const period = (id: string, startDate: string, endDate: string): Period => ({
  ...base,
  id,
  type: 'monthly',
  startDate,
  endDate,
})
const legacy = period('legacy', '2026-07-31', '2026-08-31')
const july = period('july', '2026-07-01', '2026-07-31')
const august = period('august', '2026-08-01', '2026-08-31')

async function fixture(checkpoint?: (stage: string) => void) {
  const db = new GastoClaroDB(`resolution-${crypto.randomUUID()}`)
  databases.push(db)
  const income: Income = {
    ...base,
    id: 'income',
    periodId: 'legacy',
    amount: 300000,
    description: 'synthetic',
    date: '2026-07-31',
    status: 'received',
    affectsBalance: true,
    balanceEffectiveAt: stamp,
  }
  const occurrence: RecurringPaymentOccurrence = {
    ...base,
    id: 'occurrence',
    periodId: 'legacy',
    recurringPaymentId: 'payment',
    dueDate: '2026-08-13',
    status: 'pending',
    transactionId: null,
    amount: 5000,
  }
  const payment = {
    ...base,
    id: 'payment',
    name: 'Synthetic plan',
    amount: 5000,
    frequency: 'monthly' as const,
    dueDate: '2026-07-13',
    endDate: null,
    categoryId: 'category',
    status: 'active' as const,
  }
  const settings: UserSettings = {
    id: 'settings',
    ownerId: 'owner',
    activePeriodId: 'legacy',
    currency: 'MXN',
    theme: 'system',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const remoteSettings = {
    ...settings,
    activePeriodId: 'august',
    updatedAt: '2026-09-02T00:00:00.000Z',
  }
  const operation = (
    entityType: SyncOperation['entityType'],
    record: { id: string },
    operationType: SyncOperation['operationType'] = 'create',
  ): SyncOperation => ({
    operationId: `op-${entityType}`,
    ownerId: 'owner',
    entityType,
    entityId: record.id,
    operationType,
    payload: JSON.stringify(record),
    createdAt: stamp,
    status: entityType === 'period' ? 'error' : 'pending',
    retryCount: entityType === 'period' ? 1 : 0,
    errorMessage: entityType === 'period' ? PERIOD_RESOLUTION_REQUIRED : null,
  })
  await db.periods.add(legacy)
  await db.incomes.add(income)
  await db.recurringPayments.add(payment)
  await db.recurringPaymentOccurrences.add(occurrence)
  await db.userSettings.add(settings)
  const periodOperation = operation('period', legacy)
  await db.syncOperations.bulkAdd([
    periodOperation,
    operation('income', income),
    operation('recurringPayment', payment),
    operation('recurringPaymentOccurrence', occurrence),
    operation('userSettings', settings, 'update'),
  ])
  const remote = {
    readPeriodResolutionContext: async () => ({
      periods: [july, august],
      settings: remoteSettings,
      budgets: [],
    }),
  }
  const service = new ApplyPeriodOverlapResolution(db, remote, checkpoint)
  return {
    db,
    service,
    remote,
    periodOperation,
    income,
    occurrence,
    payment,
    remoteSettings,
  }
}

describe('ApplyPeriodOverlapResolution atomic local repair', () => {
  it('retains exact alias recovery after canonical defaults without requiring a modal', async () => {
    const f = await fixture()
    const canonical = { ...legacy, id: 'canonical', syncStatus: 'synced' as const }
    const operation = { ...f.periodOperation, status: 'pending' as const, errorMessage: null, retryCount: 0 }
    await f.db.syncOperations.put(operation)
    const applyOperation = vi.fn(async (queued: SyncOperation) => {
      if (queued.entityType === 'period') throw new SyncFailure('conflict', 'overlap', '23P01', false, { constraintName: 'periods_no_overlap_per_user' })
      return { status: 'applied' as const, entityUpdatedAt: stamp, relatedEntityId: null, relatedUpdatedAt: null }
    })
    const result = await new SyncCoordinator(new DexieSyncStore(f.db), {
      verifyAuthenticatedOwner: async () => undefined,
      fetchCanonicalDefaults: async () => ({ periods: [canonical], categories: [], userSettings: { ...f.remoteSettings, activePeriodId: null } }),
      findEquivalentPeriod: async () => canonical,
      applyOperation,
      downloadPage: async () => [],
    }, () => stamp, f.service).fullSync('owner')
    expect(result.failed).toBe(0)
    expect(result.periodResolution).toBeUndefined()
    expect((await f.db.userSettings.get('settings'))?.activePeriodId).toBe(canonical.id)
    expect(await f.db.periods.get('legacy')).toBeUndefined()
    const settingsUpload = applyOperation.mock.calls.find(([queued]) => queued.entityType === 'userSettings')![0]
    expect(JSON.parse(settingsUpload.payload).activePeriodId).toBe(canonical.id)
  })
  it('preserves the remote-newer navigation decision through reconciliation before the first conflict', async () => {
    const f = await fixture()
    await f.db.syncOperations.update(f.periodOperation.operationId, {
      errorMessage: null,
      status: 'pending',
      retryCount: 0,
    })
    const gateway = {
      verifyAuthenticatedOwner: async () => undefined,
      fetchCanonicalDefaults: async () => ({
        periods: [july, august],
        categories: [],
        userSettings: f.remoteSettings,
      }),
      findEquivalentPeriod: async () => null,
      applyOperation: async () => {
        throw new SyncFailure('conflict', 'overlap', '23P01', false, {
          constraintName: 'periods_no_overlap_per_user',
        })
      },
      downloadPage: async () => [],
    }
    const coordinator = new SyncCoordinator(
      new DexieSyncStore(f.db),
      gateway,
      () => '2026-09-03T00:00:00.000Z',
      f.service,
    )
    const result = await coordinator.fullSync('owner')
    expect(result.periodResolution?.plan.classification).toBe('TRUE_OVERLAP')
    expect((await f.db.userSettings.get(f.remoteSettings.id))?.activePeriodId).toBe('august')
    const navigation = result.periodResolution!.navigation
    expect(navigation.kind).not.toBe('REQUIRES_SELECTION')
    if (navigation.kind === 'REQUIRES_SELECTION') throw new Error('Unexpected manual navigation decision')
    expect(navigation.settings.activePeriodId).toBe('august')
    expect(navigation.settings.activePeriodId).not.toBe('legacy')
    expect(result.periodResolution!.plan.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ dependency: expect.objectContaining({ kind: 'income', date: '2026-07-31' }), targetPeriodId: 'july' }),
      expect.objectContaining({ dependency: expect.objectContaining({ kind: 'recurringPaymentOccurrence', date: '2026-08-13' }), targetPeriodId: 'august' }),
    ]))
  })
  it('detects the exact constraint, reconstructs without another POST, applies and resumes uploads/download', async () => {
    const f = await fixture()
    await f.db.syncOperations.update(f.periodOperation.operationId, { errorMessage: null, status: 'pending', retryCount: 0 })
    const applyOperation = vi.fn(async (operation: SyncOperation) => {
      if (operation.entityType === 'period') throw new SyncFailure('conflict', 'overlap', '23P01', false, { constraintName: 'periods_no_overlap_per_user' })
      return { status: 'applied' as const, entityUpdatedAt: stamp, relatedEntityId: null, relatedUpdatedAt: null }
    })
    const downloadPage = vi.fn(async () => [])
    const gateway = { verifyAuthenticatedOwner: async () => undefined, findEquivalentPeriod: async () => null, applyOperation, downloadPage }
    const coordinator = new SyncCoordinator(new DexieSyncStore(f.db), gateway, () => stamp, f.service)
    const first = await coordinator.fullSync('owner')
    expect(first.periodResolution?.plan.classification).toBe('TRUE_OVERLAP')
    expect(downloadPage).not.toHaveBeenCalled()
    expect(applyOperation).toHaveBeenCalledTimes(1)
    const reconstructed = new SyncCoordinator(new DexieSyncStore(f.db), gateway, () => stamp, new ApplyPeriodOverlapResolution(f.db, f.remote))
    const second = await reconstructed.fullSync('owner')
    expect(applyOperation).toHaveBeenCalledTimes(1)
    expect((await f.db.syncOperations.get(f.periodOperation.operationId))?.retryCount).toBe(1)
    const preview = second.periodResolution!
    await reconstructed.resolvePeriodOverlap('owner', preview.operationId, { revision: preview.revision, destinations: {} })
    const resumed = await reconstructed.fullSync('owner')
    expect(resumed.failed).toBe(0)
    expect(resumed.periodResolution).toBeUndefined()
    expect(downloadPage).toHaveBeenCalled()
    expect(await f.db.syncOperations.count()).toBe(0)
    expect(await f.db.periods.get('legacy')).toBeUndefined()
    await reconstructed.fullSync('owner')
    expect(applyOperation).toHaveBeenCalledTimes(4)
  })
  it('rewrites July/August references and queue without changing financial fields', async () => {
    const f = await fixture()
    const preview = await f.service.prepare(f.periodOperation)
    await f.service.apply('owner', preview.operationId, {
      revision: preview.revision,
      destinations: {},
    })
    expect(await f.db.incomes.get('income')).toEqual({
      ...f.income,
      periodId: 'july',
    })
    expect(await f.db.recurringPaymentOccurrences.get('occurrence')).toEqual({
      ...f.occurrence,
      periodId: 'august',
    })
    expect(await f.db.recurringPayments.get('payment')).toEqual(f.payment)
    expect(await f.db.periods.get('legacy')).toBeUndefined()
    expect(await f.db.userSettings.get('settings')).toEqual(f.remoteSettings)
    const queue = await f.db.syncOperations.toArray()
    expect(queue).toHaveLength(3)
    expect(queue.some((row) => row.entityType === 'period')).toBe(false)
    expect(
      JSON.parse(queue.find((row) => row.entityType === 'income')!.payload),
    ).toEqual({ ...f.income, periodId: 'july' })
    expect(JSON.stringify(queue)).not.toContain('legacy')
    expect(await f.db.incomes.count()).toBe(1)
    expect(await f.db.recurringPaymentOccurrences.count()).toBe(1)
    await new DexieSyncStore(f.db).reconcileRemoteDefaults(
      'owner',
      { categories: [], periods: [july, august], userSettings: f.remoteSettings },
      '2026-09-03T00:00:00.000Z',
    )
    expect(JSON.stringify(await f.db.syncOperations.toArray())).not.toContain(
      'legacy',
    )
    expect((await f.db.userSettings.get('settings'))?.activePeriodId).toBe(
      'august',
    )
  })
  it.each(['after-income', 'before-period-delete'])(
    'rolls back every store on injected failure at %s',
    async (stage) => {
      const f = await fixture((current) => {
        if (current === stage) throw new Error('injected')
      })
      const before = await Promise.all(
        f.db.tables.map((table) => table.toArray()),
      )
      const preview = await f.service.prepare(f.periodOperation)
      await expect(
        f.service.apply('owner', preview.operationId, {
          revision: preview.revision,
          destinations: {},
        }),
      ).rejects.toThrow('injected')
      expect(
        await Promise.all(f.db.tables.map((table) => table.toArray())),
      ).toEqual(before)
    },
  )
  it('cancel/preparing and reconstruction do not write data', async () => {
    const f = await fixture()
    const before = await Promise.all(
      f.db.tables.map((table) => table.toArray()),
    )
    await f.service.prepare(f.periodOperation)
    const reconstructed = await new ApplyPeriodOverlapResolution(
      f.db,
      f.remote,
    ).prepare(f.periodOperation)
    expect(reconstructed.plan.classification).toBe('TRUE_OVERLAP')
    expect(
      await Promise.all(f.db.tables.map((table) => table.toArray())),
    ).toEqual(before)
  })
  it('rejects changed local state rather than applying an obsolete preview', async () => {
    const f = await fixture()
    const preview = await f.service.prepare(f.periodOperation)
    await f.db.incomes.update('income', {
      description: 'changed since preview',
    })
    await expect(
      f.service.apply('owner', preview.operationId, {
        revision: preview.revision,
        destinations: {},
      }),
    ).rejects.toBeInstanceOf(ResolutionStaleError)
    expect(await f.db.periods.get('legacy')).toEqual(legacy)
    expect((await f.db.incomes.get('income'))?.periodId).toBe('legacy')
  })
  it('aborts on a residual queue reference and rolls back financial rewrites', async () => {
    const f = await fixture()
    await f.db.syncOperations.add({
      ...f.periodOperation,
      operationId: 'extra',
      entityType: 'recurringPayment',
      entityId: 'extra',
      payload: JSON.stringify({ unexpected: { periodId: 'legacy' } }),
    })
    const preview = await f.service.prepare(f.periodOperation)
    await expect(
      f.service.apply('owner', preview.operationId, {
        revision: preview.revision,
        destinations: {},
      }),
    ).rejects.toThrow('Persisten referencias')
    expect(await f.db.incomes.get('income')).toEqual(f.income)
    expect(await f.db.periods.get('legacy')).toEqual(legacy)
  })
})
