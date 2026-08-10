import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DataMigrationService,
  LocalUserDataCleaner,
} from '@application/services/DataMigrationService'
import { GastoClaroDB } from './database'
import { DexieOwnerDataManager } from './DexieOwnerDataManager'
import type { KeyValueStorage } from './GuestOwnerStore'

const now = '2026-08-01T00:00:00.000Z' as const
const date = '2026-08-01' as const
const guest = 'guest:10000000-0000-4000-8000-000000000001'
const target = '20000000-0000-4000-8000-000000000002'
const other = '30000000-0000-4000-8000-000000000003'

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

async function seedOwner(
  db: GastoClaroDB,
  ownerId: string,
  prefix: string,
): Promise<void> {
  const base = {
    ownerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 'pending' as const,
  }
  await db.periods.add({
    ...base,
    id: `${prefix}-period`,
    type: 'monthly',
    startDate: date,
    endDate: '2026-08-31',
  })
  await db.categories.add({
    ...base,
    id: `${prefix}-category`,
    name: `Categoría ${prefix}`,
    normalizedName: `categoría ${prefix}`,
    color: '#123ABC',
    icon: null,
    isSystem: false,
  })
  await db.incomes.add({
    ...base,
    id: `${prefix}-income`,
    periodId: `${prefix}-period`,
    amount: 10000,
    description: 'Ingreso',
    date,
  })
  await db.expenses.add({
    ...base,
    id: `${prefix}-expense`,
    periodId: `${prefix}-period`,
    categoryId: `${prefix}-category`,
    amount: 100,
    description: 'Gasto',
    date,
    recurringOccurrenceId: null,
  })
  await db.categoryBudgets.add({
    ...base,
    id: `${prefix}-budget`,
    periodId: `${prefix}-period`,
    categoryId: `${prefix}-category`,
    amount: 5000,
  })
  await db.recurringPayments.add({
    ...base,
    id: `${prefix}-payment`,
    name: 'Internet',
    amount: 100,
    frequency: 'monthly',
    dueDate: date,
    endDate: null,
    categoryId: `${prefix}-category`,
    status: 'active',
  })
  await db.recurringPaymentOccurrences.add({
    ...base,
    id: `${prefix}-occurrence`,
    recurringPaymentId: `${prefix}-payment`,
    periodId: `${prefix}-period`,
    dueDate: date,
    status: 'pending',
    transactionId: null,
  })
  await db.syncOperations.add({
    operationId: `${prefix}-operation`,
    ownerId,
    entityType: 'expense',
    entityId: `${prefix}-expense`,
    operationType: 'create',
    payload: '{}',
    createdAt: now,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
  })
  await db.userSettings.add({
    id: `${prefix}-settings`,
    ownerId,
    activePeriodId: `${prefix}-period`,
    currency: 'MXN',
    theme: 'system',
    createdAt: now,
    updatedAt: now,
  })
  await db.deviceSyncStates.add({
    id: `${prefix}-device`,
    ownerId,
    entityType: 'expense',
    lastUpdatedAt: now,
    lastEntityId: `${prefix}-expense`,
    lastSuccessfulSyncAt: now,
  })
}

async function countsByOwner(
  db: GastoClaroDB,
  ownerId: string,
): Promise<number[]> {
  return Promise.all([
    db.periods.where('ownerId').equals(ownerId).count(),
    db.incomes.where('ownerId').equals(ownerId).count(),
    db.expenses.where('ownerId').equals(ownerId).count(),
    db.categories.where('ownerId').equals(ownerId).count(),
    db.categoryBudgets.where('ownerId').equals(ownerId).count(),
    db.recurringPayments.where('ownerId').equals(ownerId).count(),
    db.recurringPaymentOccurrences.where('ownerId').equals(ownerId).count(),
    db.syncOperations.where('ownerId').equals(ownerId).count(),
    db.userSettings.where('ownerId').equals(ownerId).count(),
    db.deviceSyncStates.where('ownerId').equals(ownerId).count(),
  ])
}

describe('migración y limpieza local por ownerId', () => {
  let db: GastoClaroDB
  let storage: MemoryStorage

  beforeEach(() => {
    db = new GastoClaroDB(`owner-data-${crypto.randomUUID()}`)
    storage = new MemoryStorage()
  })

  afterEach(async () => db.delete())

  it('migra atómicamente todas las tablas conservando ids y relaciones', async () => {
    await seedOwner(db, guest, 'guest')
    const service = new DataMigrationService(
      new DexieOwnerDataManager(db, storage),
    )
    await service.migrate(guest, target)
    expect(await countsByOwner(db, guest)).toEqual(Array(10).fill(0))
    expect(await countsByOwner(db, target)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 8, 1, 0,
    ])
    expect(await db.expenses.get('guest-expense')).toMatchObject({
      periodId: 'guest-period',
      categoryId: 'guest-category',
    })
    expect(storage.getItem('gastoclaro.active-owner-id')).toBe(target)
  })

  it('no modifica datos de otro propietario', async () => {
    await seedOwner(db, guest, 'guest')
    await seedOwner(db, other, 'other')
    await new DataMigrationService(
      new DexieOwnerDataManager(db, storage),
    ).migrate(guest, target)
    expect(await countsByOwner(db, other)).toEqual(Array(10).fill(1))
  })

  it('revierte todas las tablas si una etapa intermedia falla', async () => {
    await seedOwner(db, guest, 'guest')
    const manager = new DexieOwnerDataManager(db, storage, (tableName) => {
      if (tableName === 'categories') throw new Error('fallo forzado')
    })
    await expect(
      new DataMigrationService(manager).migrate(guest, target),
    ).rejects.toThrow('fallo forzado')
    expect(await countsByOwner(db, guest)).toEqual(Array(10).fill(1))
    expect(await countsByOwner(db, target)).toEqual(Array(10).fill(0))
    expect(storage.getItem('gastoclaro.active-owner-id')).toBeNull()
  })

  it('migrar un invitado vacío es seguro y determinista', async () => {
    const service = new DataMigrationService(
      new DexieOwnerDataManager(db, storage),
    )
    await service.migrate(guest, target)
    expect(await service.summarize(guest)).toEqual({
      periods: 0,
      incomes: 0,
      expenses: 0,
      categories: 0,
      budgets: 0,
      recurringPayments: 0,
      occurrences: 0,
      hasData: false,
    })
    expect(storage.getItem('gastoclaro.active-owner-id')).toBe(target)
  })

  it('bloquea atómicamente el borrado explícito mientras la cola no esté resuelta', async () => {
    await seedOwner(db, target, 'target')
    await seedOwner(db, other, 'other')
    const manager = new DexieOwnerDataManager(db, storage)

    expect(await manager.deleteOwnerIfResolved(target)).toBe(1)
    expect(await countsByOwner(db, target)).toEqual(Array(10).fill(1))

    await db.syncOperations.where('ownerId').equals(target).delete()
    expect(await manager.deleteOwnerIfResolved(target)).toBe(0)
    expect(await countsByOwner(db, target)).toEqual(Array(10).fill(0))
    expect(await countsByOwner(db, other)).toEqual(Array(10).fill(1))
  })

  it('limpia físicamente solo el propietario autenticado y su cola', async () => {
    await seedOwner(db, target, 'target')
    await db.syncOperations.add({
      operationId: 'target-error-operation',
      ownerId: target,
      entityType: 'expense',
      entityId: 'target-expense',
      operationType: 'update',
      payload: '{}',
      createdAt: now,
      status: 'error',
      errorMessage: 'fallo',
      retryCount: 1,
    })
    await seedOwner(db, guest, 'guest')
    await seedOwner(db, other, 'other')
    const cleaner = new LocalUserDataCleaner(
      new DexieOwnerDataManager(db, storage),
    )
    expect(await cleaner.countUnresolvedOperations(target)).toBe(2)
    await cleaner.deleteOwner(target)
    expect(await countsByOwner(db, target)).toEqual(Array(10).fill(0))
    expect(await countsByOwner(db, guest)).toEqual(Array(10).fill(1))
    expect(await countsByOwner(db, other)).toEqual(Array(10).fill(1))
  })

  it('cuenta pending, processing y error como operaciones no resueltas', async () => {
    await seedOwner(db, target, 'target')
    await db.syncOperations.bulkAdd([
      {
        operationId: 'target-processing-operation',
        ownerId: target,
        entityType: 'period',
        entityId: 'target-period',
        operationType: 'update',
        payload: '{}',
        createdAt: now,
        status: 'processing',
        errorMessage: null,
        retryCount: 0,
      },
      {
        operationId: 'target-error-operation',
        ownerId: target,
        entityType: 'expense',
        entityId: 'target-expense',
        operationType: 'update',
        payload: '{}',
        createdAt: now,
        status: 'error',
        errorMessage: 'fallo',
        retryCount: 1,
      },
    ])
    const cleaner = new LocalUserDataCleaner(
      new DexieOwnerDataManager(db, storage),
    )
    expect(await cleaner.countUnresolvedOperations(target)).toBe(3)
    expect(await cleaner.countUnresolvedOperations(other)).toBe(0)
  })
})
