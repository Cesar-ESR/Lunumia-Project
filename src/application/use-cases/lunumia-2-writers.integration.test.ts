import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IncomeTransitionError, MovementPeriodError } from '@domain/errors'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexieBalanceAnchorRepository,
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexiePeriodRepository,
} from '@infrastructure/local/repositories'
import { DexieRecurringPaymentTransaction } from '@infrastructure/local/transactions/DexieRecurringPaymentTransaction'
import { SetCurrentBalance } from './balance/SetCurrentBalance'
import { ReconcileCurrentBalance } from './balance/ReconcileCurrentBalance'
import { CreateIncome } from './incomes/CreateIncome'
import { CreateExpectedIncome } from './incomes/CreateExpectedIncome'
import { MarkIncomeAsReceived } from './incomes/MarkIncomeAsReceived'
import { CancelExpectedIncome } from './incomes/CancelExpectedIncome'
import { UpdateIncome } from './incomes/UpdateIncome'
import { DeleteIncome } from './incomes/DeleteIncome'
import { CreateExpense } from './expenses/CreateExpense'
import { UpdateExpense } from './expenses/UpdateExpense'
import { DeleteExpense } from './expenses/DeleteExpense'

const ownerId = '10000000-0000-4000-8000-000000000001'
const guestOwnerId = 'guest:10000000-0000-4000-8000-000000000001'
const periodOneId = '20000000-0000-4000-8000-000000000001'
const periodTwoId = '20000000-0000-4000-8000-000000000002'
const categoryId = '30000000-0000-4000-8000-000000000001'
const now = '2026-08-20T12:00:00.000Z'
const clock = { now: () => now }

let database: GastoClaroDB
let sequence: number

function ids() {
  return {
    generate: () =>
      `90000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  }
}

function repositories(owner = ownerId) {
  const generatedIds = ids()
  const dependencies = { ids: generatedIds, clock }
  return {
    ids: generatedIds,
    periods: new DexiePeriodRepository(database, owner, dependencies),
    incomes: new DexieIncomeRepository(database, owner, dependencies),
    expenses: new DexieExpenseRepository(database, owner, dependencies),
    categories: new DexieCategoryRepository(database, owner, dependencies),
    anchors: new DexieBalanceAnchorRepository(database, owner, dependencies),
    transaction: new DexieRecurringPaymentTransaction(
      database,
      generatedIds,
      clock,
    ),
  }
}

async function seedReferenceData(owner = ownerId): Promise<void> {
  const base = {
    ownerId: owner,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 'synced' as const,
  }
  await database.periods.bulkAdd([
    {
      ...base,
      id: periodOneId,
      type: 'biweekly',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    },
    {
      ...base,
      id: periodTwoId,
      type: 'biweekly',
      startDate: '2026-08-16',
      endDate: '2026-08-31',
    },
  ])
  await database.categories.add({
    ...base,
    id: categoryId,
    name: 'General',
    normalizedName: 'general',
    color: '#123ABC',
    icon: null,
    isSystem: false,
  })
}

beforeEach(() => {
  sequence = 0
  database = new GastoClaroDB(`d7-writers-${crypto.randomUUID()}`)
})

afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

describe('D7 balance writers', () => {
  it.each([600_000, 0, -25_000])(
    'SetCurrentBalance crea únicamente un anchor signed=%s y lo encola',
    async (amount) => {
      const values = repositories()
      const result = await new SetCurrentBalance(
        values.anchors,
        values.ids,
        clock,
      ).execute({ ownerId, amount })

      expect(result).toMatchObject({
        amount,
        capturedAt: now,
        ledgerCutoffAt: now,
      })
      expect(await database.balanceAnchors.count()).toBe(1)
      expect(await database.incomes.count()).toBe(0)
      expect(await database.expenses.count()).toBe(0)
      expect(await database.syncOperations.toArray()).toEqual([
        expect.objectContaining({
          entityType: 'balanceAnchor',
          entityId: result.id,
        }),
      ])
    },
  )

  it('ReconcileCurrentBalance conserva el anchor anterior y guest no encola', async () => {
    const values = repositories(guestOwnerId)
    const set = new SetCurrentBalance(values.anchors, values.ids, clock)
    const reconcile = new ReconcileCurrentBalance(
      values.anchors,
      values.ids,
      clock,
    )
    const first = await set.execute({ ownerId: guestOwnerId, amount: 682_000 })
    const second = await reconcile.execute({
      ownerId: guestOwnerId,
      amount: 675_000,
    })

    expect(second.id).not.toBe(first.id)
    expect(await database.balanceAnchors.count()).toBe(2)
    expect(await database.incomes.count()).toBe(0)
    expect(await database.expenses.count()).toBe(0)
    expect(await database.syncOperations.count()).toBe(0)
  })
})

describe('D7 income writers', () => {
  it('CreateIncome crea received V2 y permite histórico affectsBalance=false', async () => {
    await seedReferenceData()
    const values = repositories()
    const create = new CreateIncome(
      values.incomes,
      values.periods,
      values.ids,
      clock,
    )
    const normal = await create.execute({
      ownerId,
      periodId: periodTwoId,
      amount: 100_000,
      description: 'Nómina',
      date: '2026-08-20',
    })
    const historical = await create.execute({
      ownerId,
      periodId: periodOneId,
      amount: 5_000,
      description: 'Histórico',
      date: '2026-08-10',
      affectsBalance: false,
    })

    expect(normal).toMatchObject({
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: now,
    })
    expect(historical).toMatchObject({
      status: 'received',
      affectsBalance: false,
      balanceEffectiveAt: now,
    })
    expect(await database.syncOperations.count()).toBe(2)
  })

  it('CreateExpectedIncome transiciona idempotentemente a received o cancelled', async () => {
    await seedReferenceData()
    const values = repositories()
    const createExpected = new CreateExpectedIncome(
      values.incomes,
      values.periods,
      values.ids,
      clock,
    )
    const expected = await createExpected.execute({
      ownerId,
      periodId: periodTwoId,
      amount: 80_000,
      description: 'Bono esperado',
      date: '2026-08-25',
    })
    expect(expected).toMatchObject({
      status: 'expected',
      affectsBalance: false,
      balanceEffectiveAt: null,
    })

    const receive = new MarkIncomeAsReceived(values.incomes, clock)
    const received = await receive.execute(expected.id)
    const operationsAfterReceive = await database.syncOperations.count()
    expect(received).toMatchObject({
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: now,
    })
    expect(await receive.execute(expected.id)).toEqual(received)
    expect(await database.syncOperations.count()).toBe(operationsAfterReceive)
    await expect(
      new CancelExpectedIncome(values.incomes, clock).execute(expected.id),
    ).rejects.toBeInstanceOf(IncomeTransitionError)

    const cancellable = await createExpected.execute({
      ownerId,
      periodId: periodTwoId,
      amount: 20_000,
      description: 'Otro esperado',
      date: '2026-08-28',
    })
    const cancel = new CancelExpectedIncome(values.incomes, clock)
    const cancelled = await cancel.execute(cancellable.id)
    const operationsAfterCancel = await database.syncOperations.count()
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      affectsBalance: false,
      balanceEffectiveAt: null,
    })
    expect(await cancel.execute(cancellable.id)).toEqual(cancelled)
    expect(await database.syncOperations.count()).toBe(operationsAfterCancel)
    await expect(receive.execute(cancellable.id)).rejects.toBeInstanceOf(
      IncomeTransitionError,
    )
  })

  it('UpdateIncome resuelve el nuevo periodo, preserva estado y rechaza fechas huérfanas', async () => {
    await seedReferenceData()
    const values = repositories()
    const create = new CreateIncome(
      values.incomes,
      values.periods,
      values.ids,
      clock,
    )
    const income = await create.execute({
      ownerId,
      periodId: periodOneId,
      amount: 10_000,
      description: 'Inicial',
      date: '2026-08-10',
    })
    const update = new UpdateIncome(values.incomes, values.periods, clock)
    const moved = await update.execute(income.id, {
      ownerId,
      periodId: periodOneId,
      amount: 12_000,
      description: 'Movido',
      date: '2026-08-20',
      status: 'expected',
    })
    expect(moved).toMatchObject({
      periodId: periodTwoId,
      status: 'received',
      balanceEffectiveAt: now,
    })

    await expect(
      update.execute(income.id, {
        ownerId,
        periodId: periodTwoId,
        amount: 12_000,
        description: 'Sin periodo',
        date: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(MovementPeriodError)
    expect(await values.incomes.findById(income.id)).toEqual(moved)
  })

  it('CreateIncome rechaza date/period inconsistentes y DeleteIncome sólo soft-deletea', async () => {
    await seedReferenceData()
    const values = repositories()
    const create = new CreateIncome(
      values.incomes,
      values.periods,
      values.ids,
      clock,
    )
    await expect(
      create.execute({
        ownerId,
        periodId: periodOneId,
        amount: 10_000,
        description: 'Inconsistente',
        date: '2026-08-20',
      }),
    ).rejects.toBeInstanceOf(MovementPeriodError)
    expect(await database.incomes.count()).toBe(0)

    const income = await create.execute({
      ownerId,
      periodId: periodTwoId,
      amount: 10_000,
      description: 'Válido',
      date: '2026-08-20',
    })
    await new DeleteIncome(values.incomes).execute(income.id)
    expect(await values.incomes.findById(income.id)).toBeNull()
    expect(await database.incomes.get(income.id)).toMatchObject({
      status: 'received',
      deletedAt: now,
    })
    expect(await database.balanceAnchors.count()).toBe(0)
    expect(await database.expenses.count()).toBe(0)
  })
})

describe('D7 expense writers', () => {
  it('CreateExpense crea V2 y permite histórico sin impacto de balance', async () => {
    await seedReferenceData()
    const values = repositories()
    const create = new CreateExpense(
      values.expenses,
      values.periods,
      values.categories,
      values.ids,
      clock,
    )
    const normal = await create.execute({
      ownerId,
      periodId: periodTwoId,
      categoryId,
      amount: 1_000,
      description: 'Normal',
      date: '2026-08-20',
    })
    const historical = await create.execute({
      ownerId,
      periodId: periodOneId,
      categoryId,
      amount: 2_000,
      description: 'Histórico',
      date: '2026-08-10',
      affectsBalance: false,
    })
    expect(normal).toMatchObject({
      affectsBalance: true,
      balanceEffectiveAt: now,
    })
    expect(historical).toMatchObject({
      affectsBalance: false,
      balanceEffectiveAt: now,
    })
  })

  it('UpdateExpense cambia periodId por fecha y preserva efectividad y vínculo', async () => {
    await seedReferenceData()
    const values = repositories()
    const expenseId = '40000000-0000-4000-8000-000000000001'
    await database.expenses.add({
      id: expenseId,
      ownerId,
      periodId: periodOneId,
      categoryId,
      amount: 1_000,
      description: 'Vinculado',
      date: '2026-08-10',
      recurringOccurrenceId: '50000000-0000-4000-8000-000000000001',
      affectsBalance: true,
      balanceEffectiveAt: '2026-08-10T10:00:00.000Z',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'synced',
    })
    const update = new UpdateExpense(
      values.expenses,
      values.periods,
      values.categories,
      clock,
    )
    const moved = await update.execute(expenseId, {
      ownerId,
      periodId: periodOneId,
      categoryId,
      amount: 1_500,
      description: 'Movido',
      date: '2026-08-20',
    })
    expect(moved).toMatchObject({
      periodId: periodTwoId,
      recurringOccurrenceId: '50000000-0000-4000-8000-000000000001',
      balanceEffectiveAt: '2026-08-10T10:00:00.000Z',
    })

    await expect(
      update.execute(expenseId, {
        ownerId,
        periodId: periodTwoId,
        categoryId,
        amount: 1_500,
        description: 'Huérfano',
        date: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(MovementPeriodError)
    expect(await values.expenses.findById(expenseId)).toEqual(moved)
  })

  it('DeleteExpense normal sólo crea tombstone sin hechos sintéticos', async () => {
    await seedReferenceData()
    const values = repositories()
    const create = new CreateExpense(
      values.expenses,
      values.periods,
      values.categories,
      values.ids,
      clock,
    )
    const expense = await create.execute({
      ownerId,
      periodId: periodTwoId,
      categoryId,
      amount: 1_000,
      description: 'Normal',
      date: '2026-08-20',
    })
    await new DeleteExpense(values.expenses, values.transaction).execute(
      expense.id,
    )
    expect(await values.expenses.findById(expense.id)).toBeNull()
    expect(await database.expenses.get(expense.id)).toMatchObject({
      deletedAt: now,
    })
    expect(await database.incomes.count()).toBe(0)
    expect(await database.balanceAnchors.count()).toBe(0)
  })
})

describe('D7 sync boundary', () => {
  it('authenticated encola payloads V2 y guest persiste V2 sin cola', async () => {
    await seedReferenceData()
    const authenticated = repositories()
    await new CreateIncome(
      authenticated.incomes,
      authenticated.periods,
      authenticated.ids,
      clock,
    ).execute({
      ownerId,
      periodId: periodTwoId,
      amount: 10_000,
      description: 'Autenticado',
      date: '2026-08-20',
    })
    await new CreateExpense(
      authenticated.expenses,
      authenticated.periods,
      authenticated.categories,
      authenticated.ids,
      clock,
    ).execute({
      ownerId,
      periodId: periodTwoId,
      categoryId,
      amount: 1_000,
      description: 'Autenticado',
      date: '2026-08-20',
    })
    const authenticatedPayloads = (await database.syncOperations.toArray()).map(
      (operation) => JSON.parse(operation.payload) as Record<string, unknown>,
    )
    expect(authenticatedPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'received',
          affectsBalance: true,
          balanceEffectiveAt: now,
        }),
        expect.objectContaining({
          affectsBalance: true,
          balanceEffectiveAt: now,
        }),
      ]),
    )

    await database.delete()
    database = new GastoClaroDB(`d7-writers-guest-${crypto.randomUUID()}`)
    await seedReferenceData(guestOwnerId)
    const guest = repositories(guestOwnerId)
    const income = await new CreateIncome(
      guest.incomes,
      guest.periods,
      guest.ids,
      clock,
    ).execute({
      ownerId: guestOwnerId,
      periodId: periodTwoId,
      amount: 10_000,
      description: 'Guest',
      date: '2026-08-20',
    })
    const expense = await new CreateExpense(
      guest.expenses,
      guest.periods,
      guest.categories,
      guest.ids,
      clock,
    ).execute({
      ownerId: guestOwnerId,
      periodId: periodTwoId,
      categoryId,
      amount: 1_000,
      description: 'Guest',
      date: '2026-08-20',
    })
    expect(income).toMatchObject({ status: 'received', affectsBalance: true })
    expect(expense).toMatchObject({ affectsBalance: true })
    expect(await database.syncOperations.count()).toBe(0)
  })
})
