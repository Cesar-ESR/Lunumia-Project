import { afterEach, describe, expect, it } from 'vitest'
import type { Period, SyncOperation, UserSettings } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieSyncStore } from './DexieSyncStore'
import type { CanonicalPeriodMetadata } from '@application/services/PeriodNavigationCandidate'

const databases: GastoClaroDB[] = []
const ownerId = '10000000-0000-4000-8000-000000000001'
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete()
})

const older = '2026-09-09T02:01:00.000Z'
const newer = '2026-09-09T02:29:00.000Z'
const reconciledAt = '2026-09-09T03:00:00.000Z'
const canonicalPeriods: CanonicalPeriodMetadata[] = [
  { id: 'july', ownerId, type: 'monthly', startDate: '2026-07-01', endDate: '2026-07-31', deletedAt: null },
  { id: 'august', ownerId, type: 'monthly', startDate: '2026-08-01', endDate: '2026-08-31', deletedAt: null },
]

async function reconcile(options: {
  localUpdatedAt?: string
  remoteUpdatedAt?: string
  localPeriodId?: string | null
  remotePeriodId?: string | null
  invalid?: 'missing' | 'deleted' | 'wrong-owner'
  theme?: UserSettings['theme']
  currency?: string
  queued?: boolean
} = {}) {
  const db = new GastoClaroDB(`settings-authority-${crypto.randomUUID()}`)
  databases.push(db)
  const local: UserSettings = {
    id: 'local-settings', ownerId, activePeriodId: options.localPeriodId === undefined ? 'legacy' : options.localPeriodId,
    currency: options.currency ?? 'MXN', theme: options.theme ?? 'light',
    createdAt: older, updatedAt: options.localUpdatedAt ?? older,
  }
  const remote: UserSettings = {
    ...local, id: 'remote-settings', activePeriodId: options.remotePeriodId === undefined ? 'august' : options.remotePeriodId,
    currency: 'MXN', theme: 'light', updatedAt: options.remoteUpdatedAt ?? newer,
  }
  const period: Period = {
    id: local.activePeriodId!, ownerId, type: 'monthly',
    startDate: '2026-07-31', endDate: '2026-08-31',
    createdAt: older, updatedAt: older, deletedAt: null, syncStatus: 'pending',
  }
  if (period.id === 'september') {
    period.startDate = '2026-09-01'
    period.endDate = '2026-09-30'
  }
  if (options.invalid === 'deleted') period.deletedAt = newer
  if (options.invalid === 'wrong-owner') period.ownerId = '20000000-0000-4000-8000-000000000002'
  if (local.activePeriodId && options.invalid !== 'missing') await db.periods.add(period)
  await db.userSettings.add(local)
  if (options.queued !== false) {
    const operation: SyncOperation = {
      operationId: 'settings-operation', ownerId, entityType: 'userSettings',
      entityId: local.id, operationType: 'update', payload: JSON.stringify(local),
      createdAt: older, status: 'pending', retryCount: 0, errorMessage: null,
    }
    await db.syncOperations.add(operation)
  }
  const store = new DexieSyncStore(db)
  await store.reconcileRemoteDefaults(ownerId, { categories: [], periods: canonicalPeriods, userSettings: remote }, reconciledAt)
  return { db, remote, store, merged: (await db.userSettings.get(remote.id))!, queue: await db.syncOperations.toArray() }
}

describe('UserSettings original timestamp authority', () => {
  it.each([
    { localPeriodId: 'september', remotePeriodId: null, expected: 'september' },
    { localPeriodId: null, remotePeriodId: 'august', expected: 'august' },
    { localPeriodId: null, remotePeriodId: null, expected: null },
    { localPeriodId: 'legacy', remotePeriodId: null, expected: null },
    { localPeriodId: 'legacy', remotePeriodId: 'august', expected: 'august' },
  ])('resolves absence and incompatible navigation: %j', async ({ expected, ...options }) => {
    const { merged, queue, db } = await reconcile({ ...options, localUpdatedAt: newer, remoteUpdatedAt: older, theme: 'dark' })
    expect(merged.activePeriodId).toBe(expected)
    expect(merged.theme).toBe('dark')
    expect(queue).toHaveLength(1)
    expect(JSON.parse(queue[0]!.payload)).toEqual(merged)
    if (options.localPeriodId === 'legacy') expect(await db.periods.get('legacy')).toBeDefined()
  })

  it.each(['missing', 'deleted', 'wrong-owner'] as const)('never promotes %s local references', async (invalid) => {
    for (const remotePeriodId of [null, 'august']) {
      const { merged } = await reconcile({ invalid, remotePeriodId, localPeriodId: 'september', localUpdatedAt: newer, remoteUpdatedAt: older })
      expect(merged.activePeriodId).toBe(remotePeriodId)
    }
  })

  it('preserves safe local selection against newer remote absence with local theme and currency', async () => {
    const { merged, queue } = await reconcile({ localPeriodId: 'september', remotePeriodId: null, theme: 'dark', currency: 'USD' })
    expect(merged).toMatchObject({ activePeriodId: 'september', theme: 'dark', currency: 'USD' })
    expect(JSON.parse(queue[0]!.payload)).toEqual(merged)
  })

  it('uses original timestamps when both selections are valid and remote is newer', async () => {
    const { merged } = await reconcile({ localPeriodId: 'september' })
    expect(merged.activePeriodId).toBe('august')
  })
  it('prefers remote-newer navigation even before its period is downloaded; identical merge needs no update', async () => {
    const { db, remote, merged, queue } = await reconcile()
    expect(await db.periods.get('august')).toBeUndefined()
    expect(merged).toEqual(remote)
    expect(queue).toEqual([])
    expect(await db.userSettings.get('local-settings')).toBeUndefined()
  })

  it('preserves a genuinely newer local September selection with a matching payload', async () => {
    const { merged, queue } = await reconcile({ localUpdatedAt: newer, remoteUpdatedAt: older, localPeriodId: 'september' })
    expect(merged.activePeriodId).toBe('september')
    expect(queue).toHaveLength(1)
    expect(JSON.parse(queue[0]!.payload)).toEqual(merged)
  })

  it('preserves the RPC remote-wins policy on equal original timestamps', async () => {
    const { merged, remote, queue } = await reconcile({ localUpdatedAt: newer, localPeriodId: 'september' })
    expect(merged).toEqual(remote)
    expect(queue).toEqual([])
  })

  it.each([
    { theme: 'dark' as const, currency: 'MXN' },
    { theme: 'light' as const, currency: 'USD' },
    { theme: 'dark' as const, currency: 'USD' },
  ])('keeps local preferences %j without giving stale navigation new authority', async (preferences) => {
    const { merged, queue, remote, db, store } = await reconcile(preferences)
    expect(merged).toMatchObject({ ...preferences, activePeriodId: 'august' })
    expect(Date.parse(merged.updatedAt)).toBeGreaterThan(Date.parse(remote.updatedAt))
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ operationId: 'settings-operation', entityId: remote.id, operationType: 'update' })
    expect(JSON.parse(queue[0]!.payload)).toEqual(merged)
    await store.reconcileRemoteDefaults(ownerId, { categories: [], periods: canonicalPeriods, userSettings: remote }, reconciledAt)
    expect((await db.userSettings.get(remote.id))?.activePeriodId).toBe('august')
    expect(JSON.stringify(await db.syncOperations.toArray())).not.toContain('legacy')
  })

  it('creates a missing update only when preserving different preferences', async () => {
    const { merged, queue } = await reconcile({ theme: 'dark', queued: false })
    expect(queue).toHaveLength(1)
    expect(JSON.parse(queue[0]!.payload)).toEqual(merged)
    expect(merged.activePeriodId).toBe('august')
  })
})
