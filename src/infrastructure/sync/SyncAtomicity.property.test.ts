import Dexie from 'dexie'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Expense, Income, Period } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexiePeriodRepository,
} from '@infrastructure/local/repositories'
import type { SyncMutationDependencies } from '@infrastructure/local/sync-mutations'
import { periodArbitrary } from './property/arbitraries'

const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000002'
const categoryId = '30000000-0000-4000-8000-000000000003'
const failedAt = '2040-01-01T00:00:00.000Z'

type LocalAction = 'create' | 'update' | 'delete'

let database: GastoClaroDB

beforeEach(() => {
  database = new GastoClaroDB(`sync-atomicity-${crypto.randomUUID()}`)
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

function enqueueFailure(): SyncMutationDependencies {
  return {
    ids: {
      generate: () => {
        throw new Error('injected enqueue failure')
      },
    },
    clock: { now: () => failedAt },
    origin: 'local-user',
  }
}

function entitiesFrom(generated: Period): {
  period: Period
  income: Income
  expense: Expense
} {
  const base = {
    ownerId,
    createdAt: generated.createdAt,
    updatedAt: generated.updatedAt,
    deletedAt: null,
    syncStatus: 'synced' as const,
  }
  return {
    period: {
      ...base,
      id: generated.id,
      type: generated.type,
      startDate: generated.startDate,
      endDate: generated.endDate,
    },
    income: {
      ...base,
      id: generated.id,
      periodId,
      amount: 1,
      description: 'Ingreso atomico',
      date: generated.startDate,
    },
    expense: {
      ...base,
      id: generated.id,
      periodId,
      categoryId,
      amount: 1,
      description: 'Gasto atomico',
      date: generated.startDate,
      recurringOccurrenceId: null,
    },
  }
}

async function expectPeriodRollback(
  value: Period,
  action: LocalAction,
): Promise<void> {
  const repository = new DexiePeriodRepository(
    database,
    ownerId,
    enqueueFailure(),
  )
  if (action === 'create') {
    await expect(
      repository.create({ ...value, syncStatus: 'pending' }),
    ).rejects.toThrow('injected enqueue failure')
    expect(await database.periods.get(value.id)).toBeUndefined()
  } else {
    await database.periods.add(value)
    if (action === 'update') {
      await expect(
        repository.update({
          ...value,
          type: value.type === 'monthly' ? 'biweekly' : 'monthly',
          updatedAt: failedAt,
          syncStatus: 'pending',
        }),
      ).rejects.toThrow('injected enqueue failure')
    } else {
      await expect(repository.delete(value.id)).rejects.toThrow(
        'injected enqueue failure',
      )
    }
    expect(await database.periods.get(value.id)).toEqual(value)
  }
  expect(await database.syncOperations.count()).toBe(0)
}

async function expectIncomeRollback(
  value: Income,
  action: LocalAction,
): Promise<void> {
  const repository = new DexieIncomeRepository(
    database,
    ownerId,
    enqueueFailure(),
  )
  if (action === 'create') {
    await expect(
      repository.create({ ...value, syncStatus: 'pending' }),
    ).rejects.toThrow('injected enqueue failure')
    expect(await database.incomes.get(value.id)).toBeUndefined()
  } else {
    await database.incomes.add(value)
    if (action === 'update') {
      await expect(
        repository.update({
          ...value,
          description: 'Cambio que debe revertirse',
          updatedAt: failedAt,
          syncStatus: 'pending',
        }),
      ).rejects.toThrow('injected enqueue failure')
    } else {
      await expect(repository.delete(value.id)).rejects.toThrow(
        'injected enqueue failure',
      )
    }
    expect(await database.incomes.get(value.id)).toEqual(value)
  }
  expect(await database.syncOperations.count()).toBe(0)
}

async function expectExpenseRollback(
  value: Expense,
  action: LocalAction,
): Promise<void> {
  const repository = new DexieExpenseRepository(
    database,
    ownerId,
    enqueueFailure(),
  )
  if (action === 'create') {
    await expect(
      repository.create({ ...value, syncStatus: 'pending' }),
    ).rejects.toThrow('injected enqueue failure')
    expect(await database.expenses.get(value.id)).toBeUndefined()
  } else {
    await database.expenses.add(value)
    if (action === 'update') {
      await expect(
        repository.update({
          ...value,
          description: 'Cambio que debe revertirse',
          updatedAt: failedAt,
          syncStatus: 'pending',
        }),
      ).rejects.toThrow('injected enqueue failure')
    } else {
      await expect(repository.delete(value.id)).rejects.toThrow(
        'injected enqueue failure',
      )
    }
    expect(await database.expenses.get(value.id)).toEqual(value)
  }
  expect(await database.syncOperations.count()).toBe(0)
}

describe('propiedades de atomicidad entidad y cola', () => {
  it('PBT: un fallo de enqueue revierte CREATE, UPDATE y DELETE en varias entidades', async () => {
    await fc.assert(
      fc.asyncProperty(periodArbitrary, async (generated) => {
        const values = entitiesFrom(generated)
        for (const action of ['create', 'update', 'delete'] as const) {
          await resetDatabase()
          await expectPeriodRollback(values.period, action)
          await resetDatabase()
          await expectIncomeRollback(values.income, action)
          await resetDatabase()
          await expectExpenseRollback(values.expense, action)
        }
      }),
      { numRuns: 100 },
    )
  }, 15_000)

  it('PBT: un fallo de escritura de entidad nunca alcanza el enqueue', async () => {
    await fc.assert(
      fc.asyncProperty(periodArbitrary, async (generated) => {
        await resetDatabase()
        const existing = entitiesFrom(generated).period
        await database.periods.add(existing)
        let generatedOperations = 0
        const repository = new DexiePeriodRepository(database, ownerId, {
          ids: {
            generate: () => {
              generatedOperations += 1
              return '90000000-0000-4000-8000-000000000001'
            },
          },
          clock: { now: () => failedAt },
          origin: 'local-user',
        })

        await expect(
          repository.create({
            ...existing,
            type: existing.type === 'monthly' ? 'biweekly' : 'monthly',
          }),
        ).rejects.toThrow()

        expect(generatedOperations).toBe(0)
        expect(await database.periods.get(existing.id)).toEqual(existing)
        expect(await database.syncOperations.count()).toBe(0)
      }),
      { numRuns: 100 },
    )
  }, 15_000)
})
