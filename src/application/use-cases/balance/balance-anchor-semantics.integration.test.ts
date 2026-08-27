import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GetFinancialSnapshot } from '../dashboard/GetFinancialSnapshot'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexieBalanceAnchorRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexiePeriodRepository,
  DexieRecurringPaymentOccurrenceRepository,
} from '@infrastructure/local/repositories'
import { ReconcileCurrentBalance } from './ReconcileCurrentBalance'
import { SetCurrentBalance } from './SetCurrentBalance'
import { SetOpeningBalance } from './SetOpeningBalance'

const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000001'
const oldPeriodId = '20000000-0000-4000-8000-000000000002'
const t1 = '2026-08-20T10:00:00.000Z'
const t2 = '2026-08-27T20:00:00.000Z'
const t3 = '2026-08-28T10:00:00.000Z'
const t4 = '2026-08-28T11:00:00.000Z'

let database: GastoClaroDB
let clockValue = t2
let sequence = 0

beforeEach(async () => {
  database = new GastoClaroDB(`balance-anchor-semantics-${crypto.randomUUID()}`)
  clockValue = t2
  sequence = 0
  const persisted = {
    ownerId,
    type: 'monthly' as const,
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    syncStatus: 'synced' as const,
  }
  await database.periods.bulkAdd([
    {
      ...persisted,
      id: oldPeriodId,
      startDate: '2026-08-01',
      endDate: '2026-08-20',
    },
    {
      ...persisted,
      id: periodId,
      startDate: '2026-08-21',
      endDate: '2026-08-31',
    },
  ])
})

afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
})

function harness() {
  const ids = {
    generate: () =>
      `90000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  }
  const clock = { now: () => clockValue }
  const dependencies = { ids, clock }
  const anchors = new DexieBalanceAnchorRepository(
    database,
    ownerId,
    dependencies,
  )
  const incomes = new DexieIncomeRepository(database, ownerId, dependencies)
  const expenses = new DexieExpenseRepository(database, ownerId, dependencies)
  return {
    ids,
    clock,
    anchors,
    incomes,
    expenses,
    snapshot: new GetFinancialSnapshot(
      new DexiePeriodRepository(database, ownerId, dependencies),
      anchors,
      incomes,
      expenses,
      new DexieRecurringPaymentOccurrenceRepository(
        database,
        ownerId,
        dependencies,
      ),
      clock,
    ),
  }
}

async function addIncome(
  id: string,
  amount: number,
  balanceEffectiveAt: string,
  period = periodId,
) {
  await database.incomes.add({
    id,
    ownerId,
    periodId: period,
    amount,
    description: 'Ingreso',
    date: '2026-08-20',
    status: 'received',
    affectsBalance: true,
    balanceEffectiveAt,
    createdAt: balanceEffectiveAt,
    updatedAt: balanceEffectiveAt,
    deletedAt: null,
    syncStatus: 'synced',
  })
}

describe('balance anchor semantics with real Dexie repositories', () => {
  it('golden A: opening 100 plus historical income 1000 produces 1100 owner-wide', async () => {
    const values = harness()
    await addIncome('historical-income', 100_000, t1, oldPeriodId)
    const anchor = await new SetOpeningBalance(
      values.anchors,
      values.incomes,
      values.expenses,
      values.ids,
      values.clock,
    ).execute({ ownerId, amount: 10_000 })

    expect(anchor).toMatchObject({
      amount: 10_000,
      capturedAt: t2,
      ledgerCutoffAt: '2026-08-20T09:59:59.999Z',
      syncStatus: 'pending',
    })
    await expect(values.snapshot.execute()).resolves.toMatchObject({
      currentBalanceCents: 110_000,
    })
  })

  it('golden B: current 100 excludes the historical income 1000', async () => {
    const values = harness()
    await addIncome('historical-income', 100_000, t1)
    const anchor = await new SetCurrentBalance(
      values.anchors,
      values.ids,
      values.clock,
    ).execute({ ownerId, amount: 10_000 })

    expect(anchor).toMatchObject({ capturedAt: t2, ledgerCutoffAt: t2 })
    await expect(values.snapshot.execute()).resolves.toMatchObject({
      currentBalanceCents: 10_000,
    })
  })

  it('golden C: a later effective expense is applied by the existing engine', async () => {
    const values = harness()
    await addIncome('historical-income', 100_000, t1)
    await new SetOpeningBalance(
      values.anchors,
      values.incomes,
      values.expenses,
      values.ids,
      values.clock,
    ).execute({ ownerId, amount: 10_000 })
    await database.expenses.add({
      id: 'later-expense',
      ownerId,
      periodId,
      categoryId: 'category',
      amount: 25_000,
      description: 'Gasto posterior',
      date: '2026-08-28',
      recurringOccurrenceId: null,
      affectsBalance: true,
      balanceEffectiveAt: t3,
      createdAt: t3,
      updatedAt: t3,
      deletedAt: null,
      syncStatus: 'synced',
    })

    await expect(values.snapshot.execute()).resolves.toMatchObject({
      currentBalanceCents: 85_000,
      resourceUsage: {
        referenceAt: '2026-08-20T09:59:59.999Z',
        resourceBaseCents: 110_000,
      },
    })
  })

  it('golden D: reconciliation resets the reference and only later income applies', async () => {
    const values = harness()
    await addIncome('historical-income', 100_000, t1)
    await new SetOpeningBalance(
      values.anchors,
      values.incomes,
      values.expenses,
      values.ids,
      values.clock,
    ).execute({ ownerId, amount: 10_000 })
    clockValue = t3
    await new ReconcileCurrentBalance(
      values.anchors,
      values.ids,
      values.clock,
    ).execute({ ownerId, amount: 90_000 })
    await expect(values.snapshot.execute()).resolves.toMatchObject({
      currentBalanceCents: 90_000,
    })

    await addIncome('later-income', 5_000, t4)
    await expect(values.snapshot.execute()).resolves.toMatchObject({
      currentBalanceCents: 95_000,
    })
    expect(await database.balanceAnchors.count()).toBe(2)
  })
})
