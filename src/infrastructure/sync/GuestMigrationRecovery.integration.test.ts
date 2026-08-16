import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  BalanceAnchor,
  Category,
  Expense,
  Period,
  SyncCursor,
  SyncEntityType,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import {
  SyncCoordinator,
  SyncFailure,
  type RemoteDefaultSnapshot,
  type RemoteEntityChange,
  type RemoteMutationResult,
  type RemoteSyncGateway,
} from '@application/services/SyncCoordinator'
import { DataMigrationService } from '@application/services/DataMigrationService'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieOwnerDataManager } from '@infrastructure/local/DexieOwnerDataManager'
import type { KeyValueStorage } from '@infrastructure/local/GuestOwnerStore'
import { DexieSyncStore } from './DexieSyncStore'

const guestOwnerId = 'guest:10000000-0000-4000-8000-000000000001'
const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000002'
const localCategoryId = '30000000-0000-4000-8000-000000000003'
const remoteCategoryId = '40000000-0000-4000-8000-000000000004'
const firstExpenseId = '50000000-0000-4000-8000-000000000005'
const secondExpenseId = '60000000-0000-4000-8000-000000000006'
const localSettingsId = '70000000-0000-4000-8000-000000000007'
const remoteSettingsId = '80000000-0000-4000-8000-000000000008'
const balanceAnchorId = '90000000-0000-4000-8000-000000000009'
const entityInstant = '2026-08-09T05:30:00.000Z'
const migrationInstant = '2026-08-09T06:17:39.705Z'
const reconciliationInstant = '2026-08-09T07:00:00.000Z'

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class ForeignKeyRemote implements RemoteSyncGateway {
  readonly uploadOrder: SyncEntityType[] = []
  readonly processed = new Set<string>()
  readonly periods = new Map<string, Period>()
  readonly categories = new Map<string, Category>()
  readonly expenses = new Map<string, Expense>()
  readonly balanceAnchors = new Map<string, BalanceAnchor>()
  userSettings: UserSettings | null

  constructor(defaults = remoteDefaults()) {
    defaults.systemCategories.forEach((category) =>
      this.categories.set(category.id, category),
    )
    this.userSettings = defaults.userSettings
  }

  async verifyAuthenticatedOwner(candidate: string): Promise<void> {
    if (candidate !== ownerId) throw new Error('Propietario inesperado.')
  }

  async fetchCanonicalDefaults(): Promise<RemoteDefaultSnapshot> {
    return {
      systemCategories: [...this.categories.values()].filter(
        (category) => category.isSystem && category.deletedAt === null,
      ),
      userSettings: this.userSettings,
    }
  }

  async applyOperation(
    operation: SyncOperation,
  ): Promise<RemoteMutationResult> {
    if (this.processed.has(operation.operationId))
      return mutationResult('already_processed', null)
    this.uploadOrder.push(operation.entityType)
    const payload = JSON.parse(operation.payload) as Record<string, unknown>

    switch (operation.entityType) {
      case 'period': {
        const value = payload as unknown as Period
        this.periods.set(value.id, { ...value, syncStatus: 'synced' })
        break
      }
      case 'category': {
        const value = payload as unknown as Category
        if (
          [...this.categories.values()].some(
            (category) =>
              category.id !== value.id &&
              category.normalizedName === value.normalizedName &&
              category.deletedAt === null,
          )
        )
          throw new SyncFailure('conflict', 'CategorÃ­a duplicada.', '23505')
        this.categories.set(value.id, { ...value, syncStatus: 'synced' })
        break
      }
      case 'expense': {
        const value = payload as unknown as Expense
        if (
          !this.periods.has(value.periodId) ||
          !this.categories.has(value.categoryId)
        )
          throw new SyncFailure('validation', 'FK ausente.', '23503')
        this.expenses.set(value.id, { ...value, syncStatus: 'synced' })
        break
      }
      case 'balanceAnchor': {
        const value = payload as unknown as BalanceAnchor
        this.balanceAnchors.set(value.id, { ...value, syncStatus: 'synced' })
        break
      }
      case 'userSettings': {
        const value = payload as unknown as UserSettings
        if (value.activePeriodId && !this.periods.has(value.activePeriodId))
          throw new SyncFailure('validation', 'FK ausente.', '23503')
        this.userSettings = value
        break
      }
      default:
        break
    }
    this.processed.add(operation.operationId)
    return mutationResult(
      'applied',
      typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    )
  }

  async downloadPage(
    _ownerId: string,
    entityType: SyncEntityType,
    cursor: SyncCursor,
    limit: number,
  ): Promise<RemoteEntityChange[]> {
    const changes = this.changes(entityType)
      .filter(
        (change) =>
          cursor.lastUpdatedAt === null ||
          change.record.updatedAt > cursor.lastUpdatedAt ||
          (change.record.updatedAt === cursor.lastUpdatedAt &&
            change.record.id > (cursor.lastEntityId ?? '')),
      )
      .slice(0, limit)
    return changes
  }

  private changes(entityType: SyncEntityType): RemoteEntityChange[] {
    switch (entityType) {
      case 'period':
        return sortRecords(this.periods.values()).map((record) => ({
          entityType,
          record,
        }))
      case 'category':
        return sortRecords(this.categories.values()).map((record) => ({
          entityType,
          record,
        }))
      case 'expense':
        return sortRecords(this.expenses.values()).map((record) => ({
          entityType,
          record,
        }))
      case 'balanceAnchor':
        return sortRecords(this.balanceAnchors.values()).map((record) => ({
          entityType,
          record,
        }))
      case 'userSettings':
        return this.userSettings
          ? [{ entityType, record: this.userSettings }]
          : []
      default:
        return []
    }
  }
}

let database: GastoClaroDB

beforeEach(() => {
  database = new GastoClaroDB(`guest-recovery-${crypto.randomUUID()}`)
})

afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

describe('recuperaciÃ³n guest -> cuenta con dependencias y defaults remotos', () => {
  it('migra, reconcilia y sube padres antes que hijos aunque el gasto en error tenga el menor UUID', async () => {
    await seedGuest(database)
    await migrateGuest(database)
    const failedExpenseOperation = await operationFor(
      database,
      'expense',
      firstExpenseId,
    )
    await database.syncOperations.put({
      ...failedExpenseOperation,
      status: 'error',
      retryCount: 6,
      errorMessage: 'FallÃ³ la subida de una operaciÃ³n.',
    })

    const store = deterministicStore(database)
    const beforeReconciliation = await store.findUploadable(ownerId)
    expect(beforeReconciliation.map(({ entityType }) => entityType)).toEqual([
      'category',
      'period',
      'expense',
      'expense',
      'balanceAnchor',
      'userSettings',
    ])
    expect(beforeReconciliation[2]).toMatchObject({
      entityId: firstExpenseId,
      status: 'error',
      retryCount: 6,
    })

    const remote = new ForeignKeyRemote()
    await expect(
      remote.applyOperation(failedExpenseOperation),
    ).rejects.toMatchObject({ kind: 'validation', code: '23503' })
    remote.uploadOrder.length = 0

    const result = await new SyncCoordinator(
      store,
      remote,
      () => reconciliationInstant,
    ).sync(ownerId)

    expect(result.failed).toBe(0)
    expect(remote.uploadOrder).toEqual([
      'period',
      'expense',
      'expense',
      'balanceAnchor',
      'userSettings',
    ])
    expect(remote.periods).toHaveLength(1)
    expect(remote.expenses).toHaveLength(2)
    expect(remote.balanceAnchors.get(balanceAnchorId)).toMatchObject({
      amount: -25_000,
      capturedAt: entityInstant,
    })
    expect(
      [...remote.expenses.values()].reduce(
        (total, expense) => total + expense.amount,
        0,
      ),
    ).toBe(112_550)
    expect(
      [...remote.expenses.values()].every(
        (expense) => expense.categoryId === remoteCategoryId,
      ),
    ).toBe(true)
    expect(remote.categories).toHaveLength(1)
    expect(remote.userSettings).toMatchObject({
      id: remoteSettingsId,
      activePeriodId: periodId,
    })
    expect(await database.syncOperations.count()).toBe(0)
    expect(await database.categories.get(localCategoryId)).toBeUndefined()
    expect(await database.categories.get(remoteCategoryId)).toBeDefined()
    expect(await database.userSettings.get(localSettingsId)).toBeUndefined()
  })

  it('un cliente nuevo descarga el mismo periodo, gastos, categorÃ­a y settings', async () => {
    await seedGuest(database)
    await migrateGuest(database)
    const remote = new ForeignKeyRemote()
    const firstResult = await new SyncCoordinator(
      deterministicStore(database),
      remote,
      () => reconciliationInstant,
    ).sync(ownerId)
    expect(firstResult.failed).toBe(0)

    const newClient = new GastoClaroDB(`new-client-${crypto.randomUUID()}`)
    try {
      const secondResult = await new SyncCoordinator(
        deterministicStore(newClient),
        remote,
        () => reconciliationInstant,
      ).sync(ownerId)
      expect(secondResult.failed).toBe(0)
      expect(await newClient.periods.count()).toBe(1)
      expect(await newClient.expenses.count()).toBe(2)
      expect(await newClient.balanceAnchors.get(balanceAnchorId)).toMatchObject(
        {
          amount: -25_000,
          ownerId,
        },
      )
      expect(await newClient.categories.toArray()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: remoteCategoryId }),
        ]),
      )
      expect(await newClient.userSettings.get(remoteSettingsId)).toMatchObject({
        activePeriodId: periodId,
      })
    } finally {
      newClient.close()
      await Dexie.delete(newClient.name)
    }
  })

  it('revierte referencias, IDs y cola si falla la reconciliaciÃ³n', async () => {
    await seedGuest(database)
    await migrateGuest(database)
    const beforeQueue = await database.syncOperations.toArray()
    const store = new DexieSyncStore(
      database,
      deterministicDependencies(),
      (step) => {
        if (step.startsWith('userSettings:'))
          throw new Error('fallo de reconciliaciÃ³n forzado')
      },
    )

    await expect(
      store.reconcileRemoteDefaults(
        ownerId,
        remoteDefaults(),
        reconciliationInstant,
      ),
    ).rejects.toThrow('fallo de reconciliaciÃ³n forzado')

    expect(await database.categories.get(localCategoryId)).toBeDefined()
    expect(await database.categories.get(remoteCategoryId)).toBeUndefined()
    expect((await database.expenses.get(firstExpenseId))?.categoryId).toBe(
      localCategoryId,
    )
    expect(await database.userSettings.get(localSettingsId)).toBeDefined()
    expect(await database.syncOperations.toArray()).toEqual(beforeQueue)
  })
  it('reconcileRemoteDefaults conserva la cantidad de periodos y gastos', async () => {
    await seedGuest(database)
    await migrateGuest(database)
    const before = {
      periods: await database.periods.where('ownerId').equals(ownerId).count(),
      expenses: await database.expenses
        .where('ownerId')
        .equals(ownerId)
        .count(),
    }

    await deterministicStore(database).reconcileRemoteDefaults(
      ownerId,
      remoteDefaults(),
      reconciliationInstant,
    )

    expect({
      periods: await database.periods.where('ownerId').equals(ownerId).count(),
      expenses: await database.expenses
        .where('ownerId')
        .equals(ownerId)
        .count(),
    }).toEqual(before)
    expect(before).toEqual({ periods: 1, expenses: 2 })
    expect(
      await database.expenses.bulkGet([firstExpenseId, secondExpenseId]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: remoteCategoryId }),
        expect.objectContaining({ categoryId: remoteCategoryId }),
      ]),
    )
  })
})

async function seedGuest(db: GastoClaroDB): Promise<void> {
  const base = {
    ownerId: guestOwnerId,
    createdAt: entityInstant,
    updatedAt: entityInstant,
    deletedAt: null,
    syncStatus: 'pending' as const,
  }
  await db.periods.add({
    ...base,
    id: periodId,
    type: 'biweekly',
    startDate: '2026-08-01',
    endDate: '2026-08-15',
  })
  await db.categories.add({
    ...base,
    id: localCategoryId,
    name: 'Sin categorÃ­a',
    normalizedName: 'sin categorÃ­a',
    color: '#64748B',
    icon: 'inbox',
    isSystem: true,
  })
  await db.expenses.bulkAdd([
    {
      ...base,
      id: firstExpenseId,
      periodId,
      categoryId: localCategoryId,
      amount: 12_550,
      description: 'Prueba Android',
      date: '2026-08-09',
      recurringOccurrenceId: null,
    },
    {
      ...base,
      id: secondExpenseId,
      periodId,
      categoryId: localCategoryId,
      amount: 100_000,
      description: 'Ptas',
      date: '2026-08-09',
      recurringOccurrenceId: null,
    },
  ])
  await db.userSettings.add({
    id: localSettingsId,
    ownerId: guestOwnerId,
    activePeriodId: periodId,
    currency: 'MXN',
    theme: 'system',
    createdAt: entityInstant,
    updatedAt: entityInstant,
  })
  await db.balanceAnchors.add({
    ...base,
    id: balanceAnchorId,
    amount: -25_000,
    capturedAt: entityInstant,
    ledgerCutoffAt: '2026-08-09T05:29:59.999Z',
  })
}

async function migrateGuest(db: GastoClaroDB): Promise<void> {
  const operationIds = [
    'c0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000004',
    'd0000000-0000-4000-8000-000000000005',
    'e0000000-0000-4000-8000-000000000006',
  ]
  let index = 0
  await new DataMigrationService(
    new DexieOwnerDataManager(db, new MemoryStorage(), () => undefined, {
      ids: { generate: () => operationIds[index++]! },
      clock: { now: () => migrationInstant },
    }),
  ).migrate(guestOwnerId, ownerId)
}

function deterministicStore(db: GastoClaroDB): DexieSyncStore {
  return new DexieSyncStore(db, deterministicDependencies())
}

function deterministicDependencies() {
  let sequence = 100
  return {
    ids: {
      generate: () =>
        `90000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    },
    clock: { now: () => reconciliationInstant },
  }
}

async function operationFor(
  db: GastoClaroDB,
  entityType: SyncEntityType,
  entityId: string,
): Promise<SyncOperation> {
  const operation = (await db.syncOperations.toArray()).find(
    (candidate) =>
      candidate.entityType === entityType && candidate.entityId === entityId,
  )
  if (!operation) throw new Error('No se encontrÃ³ la operaciÃ³n esperada.')
  return operation
}

function remoteDefaults(): RemoteDefaultSnapshot {
  return {
    systemCategories: [
      {
        id: remoteCategoryId,
        ownerId,
        name: 'Sin categorÃ­a',
        normalizedName: 'sin categorÃ­a',
        color: '#64748B',
        icon: 'inbox',
        isSystem: true,
        createdAt: '2026-08-09T06:18:02.723Z',
        updatedAt: '2026-08-09T06:18:02.899Z',
        deletedAt: null,
        syncStatus: 'synced',
      },
    ],
    userSettings: {
      id: remoteSettingsId,
      ownerId,
      activePeriodId: null,
      currency: 'MXN',
      theme: 'system',
      createdAt: '2026-08-09T06:18:02.723Z',
      updatedAt: '2026-08-09T06:18:02.792Z',
    },
  }
}

function mutationResult(
  status: RemoteMutationResult['status'],
  entityUpdatedAt: string | null,
): RemoteMutationResult {
  return {
    status,
    entityUpdatedAt,
    relatedEntityId: null,
    relatedUpdatedAt: null,
  }
}

function sortRecords<T extends { id: string; updatedAt: string }>(
  records: Iterable<T>,
): T[] {
  return [...records].sort(
    (left, right) =>
      left.updatedAt.localeCompare(right.updatedAt) ||
      left.id.localeCompare(right.id),
  )
}
