import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SyncMutationDependencies } from './sync-mutations'
import { GastoClaroDB } from './database'
import {
  DexieCategoryBudgetRepository,
  DexieBalanceAnchorRepository,
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexiePeriodRepository,
  DexieRecurringPaymentOccurrenceRepository,
  DexieRecurringPaymentRepository,
  DexieUserSettingsRepository,
} from './repositories'
import { DexieCategoryDeletionTransaction } from './transactions/DexieCategoryDeletionTransaction'

const ownerId = '10000000-0000-4000-8000-000000000001'
const guestOwnerId = 'guest:10000000-0000-4000-8000-000000000001'
const now = '2026-08-01T12:00:00.000Z'

function dependencies(
  origin: SyncMutationDependencies['origin'] = 'local-user',
  failAt?: number,
): SyncMutationDependencies {
  let sequence = 0
  return {
    ids: {
      generate: () => {
        sequence += 1
        if (sequence === failAt) throw new Error('fallo forzado de cola')
        return `90000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
      },
    },
    clock: { now: () => now },
    origin,
  }
}

function base(owner = ownerId) {
  return {
    ownerId: owner,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 'pending' as const,
  }
}

let database: GastoClaroDB

beforeEach(() => {
  database = new GastoClaroDB(`sync-queue-integration-${crypto.randomUUID()}`)
})
afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

describe('cola local de sincronización', () => {
  it('encola exactamente una creación para cada entidad sincronizable', async () => {
    const sync = dependencies()
    await new DexiePeriodRepository(database, ownerId, sync).create({
      ...base(),
      id: 'period',
      type: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    await new DexieCategoryRepository(database, ownerId, sync).create({
      ...base(),
      id: 'category',
      name: 'Comida',
      normalizedName: 'comida',
      color: '#123ABC',
      icon: null,
      isSystem: false,
    })
    await new DexieIncomeRepository(database, ownerId, sync).create({
      ...base(),
      id: 'income',
      periodId: 'period',
      amount: 123_45,
      description: 'Nómina',
      date: '2026-08-01',
    })
    await new DexieExpenseRepository(database, ownerId, sync).create({
      ...base(),
      id: 'expense',
      periodId: 'period',
      categoryId: 'category',
      amount: 67_89,
      description: 'Compra',
      date: '2026-08-02',
      recurringOccurrenceId: null,
    })
    await new DexieCategoryBudgetRepository(database, ownerId, sync).upsert({
      ...base(),
      id: 'budget',
      periodId: 'period',
      categoryId: 'category',
      amount: 500_00,
    })
    await new DexieRecurringPaymentRepository(database, ownerId, sync).create({
      ...base(),
      id: 'payment',
      name: 'Internet',
      amount: 300_00,
      frequency: 'monthly',
      dueDate: '2026-08-10',
      endDate: null,
      categoryId: 'category',
      status: 'active',
    })
    await new DexieRecurringPaymentOccurrenceRepository(
      database,
      ownerId,
      sync,
    ).create({
      ...base(),
      id: 'occurrence',
      recurringPaymentId: 'payment',
      periodId: 'period',
      dueDate: '2026-08-10',
      status: 'pending',
      transactionId: null,
    })
    await new DexieBalanceAnchorRepository(database, ownerId, sync).create({
      ...base(),
      id: 'anchor',
      amount: -12_345,
      capturedAt: now,
      ledgerCutoffAt: now,
    })
    await new DexieUserSettingsRepository(database, ownerId, sync).upsert({
      id: 'settings',
      ownerId,
      activePeriodId: 'period',
      currency: 'MXN',
      theme: 'system',
      createdAt: now,
      updatedAt: now,
    })

    const operations = await database.syncOperations
      .orderBy('createdAt')
      .toArray()
    expect(operations).toHaveLength(9)
    expect(new Set(operations.map(({ entityType }) => entityType))).toEqual(
      new Set([
        'period',
        'category',
        'income',
        'expense',
        'categoryBudget',
        'recurringPayment',
        'recurringPaymentOccurrence',
        'balanceAnchor',
        'userSettings',
      ]),
    )
    const incomeOperation = operations.find(
      ({ entityType }) => entityType === 'income',
    )
    if (!incomeOperation)
      throw new Error('No se creó la operación del ingreso.')
    const incomePayload = JSON.parse(incomeOperation.payload)
    expect(incomePayload).toMatchObject({ amount: 123_45, date: '2026-08-01' })
    expect(JSON.stringify(incomePayload)).not.toMatch(/token|session|secret/i)
  })

  it('distingue create/update y conserva un tombstone completo al eliminar', async () => {
    const sync = dependencies()
    const incomes = new DexieIncomeRepository(database, ownerId, sync)
    const created = {
      ...base(),
      id: 'income',
      periodId: 'period',
      amount: 100,
      description: 'Inicial',
      date: '2026-08-01',
    }
    await incomes.create(created)
    await incomes.update({
      ...created,
      amount: 250,
      updatedAt: '2026-08-02T12:00:00.000Z',
    })
    await incomes.delete(created.id)

    const operations = await database.syncOperations.toArray()
    expect(operations.map(({ operationType }) => operationType)).toEqual([
      'create',
      'update',
      'delete',
    ])
    const deleteOperation = operations[2]
    if (!deleteOperation)
      throw new Error('No se creó la operación de eliminación.')
    const tombstone = JSON.parse(deleteOperation.payload)
    expect(tombstone).toMatchObject({
      id: created.id,
      amount: 250,
      deletedAt: now,
      syncStatus: 'pending',
    })
    expect(await incomes.findById(created.id)).toBeNull()
    expect((await database.incomes.get(created.id))?.deletedAt).toBe(now)
  })

  it('revierte la entidad cuando falla la creación de la operación', async () => {
    const expenses = new DexieExpenseRepository(
      database,
      ownerId,
      dependencies('local-user', 1),
    )
    await expect(
      expenses.create({
        ...base(),
        id: 'expense',
        periodId: 'period',
        categoryId: 'category',
        amount: 100,
        description: 'Falla',
        date: '2026-08-01',
        recurringOccurrenceId: null,
      }),
    ).rejects.toThrow('fallo forzado de cola')
    expect(await database.expenses.count()).toBe(0)
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('no deja una operación si falla la escritura de la entidad', async () => {
    const expenses = new DexieExpenseRepository(
      database,
      ownerId,
      dependencies(),
    )
    const value = {
      ...base(),
      id: 'expense',
      periodId: 'period',
      categoryId: 'category',
      amount: 100,
      description: 'Duplicado',
      date: '2026-08-01',
      recurringOccurrenceId: null,
    }
    await database.expenses.add(value)
    await expect(expenses.create(value)).rejects.toBeDefined()
    expect(await database.expenses.count()).toBe(1)
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('mantiene las escrituras de invitado estrictamente locales', async () => {
    const sync = dependencies()
    await new DexieCategoryRepository(database, guestOwnerId, sync).create({
      ...base(guestOwnerId),
      id: 'guest-category',
      name: 'Local',
      normalizedName: 'local',
      color: '#123ABC',
      icon: null,
      isSystem: false,
    })
    await new DexieUserSettingsRepository(database, guestOwnerId, sync).upsert({
      id: 'guest-settings',
      ownerId: guestOwnerId,
      activePeriodId: null,
      currency: 'MXN',
      theme: 'system',
      createdAt: now,
      updatedAt: now,
    })
    expect(await database.categories.count()).toBe(1)
    expect(await database.userSettings.count()).toBe(1)
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('permite aplicar cambios remotos localmente sin reencolarlos', async () => {
    const repository = new DexiePeriodRepository(
      database,
      ownerId,
      dependencies('remote-apply'),
    )
    await repository.create({
      ...base(),
      id: 'remote-period',
      type: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    expect(await repository.findById('remote-period')).not.toBeNull()
    expect(await database.syncOperations.count()).toBe(0)
  })

  it('encola atómicamente las reasignaciones y tombstones al borrar una categoría', async () => {
    const source = {
      ...base(),
      id: 'source',
      name: 'Origen',
      normalizedName: 'origen',
      color: '#111111',
      icon: null,
      isSystem: false,
    }
    const replacement = {
      ...base(),
      id: 'replacement',
      name: 'Sin categoría',
      normalizedName: 'sin categoría',
      color: '#222222',
      icon: null,
      isSystem: true,
    }
    await database.categories.bulkAdd([source, replacement])
    await database.expenses.add({
      ...base(),
      id: 'expense',
      periodId: 'period',
      categoryId: source.id,
      amount: 100,
      description: 'Compra',
      date: '2026-08-01',
      recurringOccurrenceId: null,
    })
    await database.recurringPayments.add({
      ...base(),
      id: 'payment',
      name: 'Servicio',
      amount: 100,
      frequency: 'monthly',
      dueDate: '2026-08-01',
      endDate: null,
      categoryId: source.id,
      status: 'active',
    })
    await database.categoryBudgets.add({
      ...base(),
      id: 'budget',
      periodId: 'period',
      categoryId: source.id,
      amount: 100,
    })

    await new DexieCategoryDeletionTransaction(
      database,
      ownerId,
      dependencies(),
    ).reassignAndDelete(source.id, replacement.id)

    expect(await database.syncOperations.count()).toBe(4)
    expect((await database.expenses.get('expense'))?.categoryId).toBe(
      replacement.id,
    )
    expect((await database.recurringPayments.get('payment'))?.categoryId).toBe(
      replacement.id,
    )
    expect((await database.categoryBudgets.get('budget'))?.deletedAt).toBe(now)
    expect((await database.categories.get(source.id))?.deletedAt).toBe(now)
  })

  it('revierte toda la reasignación de categoría si falla cualquier operación', async () => {
    const source = {
      ...base(),
      id: 'source',
      name: 'Origen',
      normalizedName: 'origen',
      color: '#111111',
      icon: null,
      isSystem: false,
    }
    const replacement = {
      ...base(),
      id: 'replacement',
      name: 'Destino',
      normalizedName: 'destino',
      color: '#222222',
      icon: null,
      isSystem: true,
    }
    await database.categories.bulkAdd([source, replacement])
    await database.expenses.add({
      ...base(),
      id: 'expense',
      periodId: 'period',
      categoryId: source.id,
      amount: 100,
      description: 'Compra',
      date: '2026-08-01',
      recurringOccurrenceId: null,
    })
    await expect(
      new DexieCategoryDeletionTransaction(
        database,
        ownerId,
        dependencies('local-user', 2),
      ).reassignAndDelete(source.id, replacement.id),
    ).rejects.toThrow('fallo forzado de cola')
    expect((await database.expenses.get('expense'))?.categoryId).toBe(source.id)
    expect((await database.categories.get(source.id))?.deletedAt).toBeNull()
    expect(await database.syncOperations.count()).toBe(0)
  })
})
