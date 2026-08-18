import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { GetFinancialSnapshot } from './GetFinancialSnapshot'
import { CurrentPeriodConflictError, DomainError } from '@domain/errors'
import type {
  BalanceAnchor,
  ExpenseV2,
  IncomeV2,
  Period,
  RecurringPaymentOccurrence,
  RecurringPaymentOccurrenceV2,
} from '@domain/entities'
import type {
  IBalanceAnchorRepository,
  IExpenseRepository,
  IIncomeRepository,
  IPeriodRepository,
  IRecurringPaymentOccurrenceRepository,
} from '@domain/repositories'
import { GastoClaroDB } from '@infrastructure/local/database'
import { DexieBalanceAnchorRepository } from '@infrastructure/local/repositories/DexieBalanceAnchorRepository'
import { DexieExpenseRepository } from '@infrastructure/local/repositories/DexieExpenseRepository'
import { DexieIncomeRepository } from '@infrastructure/local/repositories/DexieIncomeRepository'
import { DexiePeriodRepository } from '@infrastructure/local/repositories/DexiePeriodRepository'
import { DexieRecurringPaymentOccurrenceRepository } from '@infrastructure/local/repositories/DexieRecurringPaymentOccurrenceRepository'

const ownerId = '10000000-0000-4000-8000-000000000001'
const otherOwnerId = '10000000-0000-4000-8000-000000000099'
const currentPeriodId = '20000000-0000-4000-8000-000000000002'
const oldPeriodId = '20000000-0000-4000-8000-000000000001'
const cutoff = '2026-08-10T00:00:00.000Z'
const afterCutoff = '2026-08-15T12:00:00.000Z'
const deletedAt = null
const base = {
  ownerId,
  createdAt: cutoff,
  updatedAt: cutoff,
  deletedAt,
  syncStatus: 'synced' as const,
}

const period = (overrides: Partial<Period> = {}): Period => ({
  ...base,
  id: currentPeriodId,
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  ...overrides,
})

const anchor = (
  amount = 1_000,
  overrides: Partial<BalanceAnchor> = {},
): BalanceAnchor => ({
  ...base,
  id: '30000000-0000-4000-8000-000000000003',
  amount,
  capturedAt: cutoff,
  ledgerCutoffAt: cutoff,
  ...overrides,
})

const income = (
  amount: number,
  overrides: Partial<IncomeV2> = {},
): IncomeV2 => ({
  ...base,
  id: '40000000-0000-4000-8000-000000000004',
  periodId: currentPeriodId,
  amount,
  description: 'Ingreso',
  date: '2026-08-15',
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: afterCutoff,
  ...overrides,
})

const expense = (
  amount: number,
  overrides: Partial<ExpenseV2> = {},
): ExpenseV2 => ({
  ...base,
  id: '50000000-0000-4000-8000-000000000005',
  periodId: currentPeriodId,
  categoryId: '60000000-0000-4000-8000-000000000006',
  amount,
  description: 'Gasto',
  date: '2026-08-15',
  recurringOccurrenceId: null,
  affectsBalance: true,
  balanceEffectiveAt: afterCutoff,
  ...overrides,
})

const occurrence = (
  amount: number,
  overrides: Partial<RecurringPaymentOccurrenceV2> = {},
): RecurringPaymentOccurrenceV2 => ({
  ...base,
  id: '70000000-0000-4000-8000-000000000007',
  recurringPaymentId: '80000000-0000-4000-8000-000000000008',
  periodId: currentPeriodId,
  dueDate: '2026-08-20',
  status: 'pending',
  amount,
  transactionId: null,
  ...overrides,
})

interface RepositoryData {
  periods: Period[]
  anchor: BalanceAnchor | null
  incomes: IncomeV2[]
  expenses: ExpenseV2[]
  occurrences: RecurringPaymentOccurrence[]
}

const defaultData = (): RepositoryData => ({
  periods: [period()],
  anchor: anchor(),
  incomes: [],
  expenses: [],
  occurrences: [],
})

function createHarness(
  overrides: Partial<RepositoryData> = {},
  now = afterCutoff,
) {
  const data = { ...defaultData(), ...overrides }
  const unexpectedWrite = vi.fn(async () => {
    throw new Error('GetFinancialSnapshot attempted a write.')
  })
  const reads = {
    periods: vi.fn(async () => data.periods),
    anchor: vi.fn(async () => data.anchor),
    incomes: vi.fn(async () => data.incomes),
    expenses: vi.fn(async () => data.expenses),
    occurrences: vi.fn(async () => data.occurrences),
  }
  const periods = {
    findAll: reads.periods,
    create: unexpectedWrite,
    update: unexpectedWrite,
    delete: unexpectedWrite,
  } as unknown as IPeriodRepository
  const anchors = {
    findLatest: reads.anchor,
    create: unexpectedWrite,
  } as unknown as IBalanceAnchorRepository
  const incomes = {
    findAll: reads.incomes,
    create: unexpectedWrite,
    update: unexpectedWrite,
    delete: unexpectedWrite,
  } as unknown as IIncomeRepository
  const expenses = {
    findAll: reads.expenses,
    create: unexpectedWrite,
    update: unexpectedWrite,
    delete: unexpectedWrite,
  } as unknown as IExpenseRepository
  const occurrences = {
    findAll: reads.occurrences,
    create: unexpectedWrite,
    update: unexpectedWrite,
  } as unknown as IRecurringPaymentOccurrenceRepository

  return {
    data,
    reads,
    unexpectedWrite,
    useCase: new GetFinancialSnapshot(
      periods,
      anchors,
      incomes,
      expenses,
      occurrences,
      { now: () => now },
    ),
  }
}

describe('GetFinancialSnapshot', () => {
  it('orchestrates a complete happy path through the real D8 engine', async () => {
    const received = income(100)
    const expected = income(200, {
      id: 'expected',
      status: 'expected',
      affectsBalance: false,
      balanceEffectiveAt: null,
      date: '2026-08-25',
    })
    const harness = createHarness({
      incomes: [received, expected],
      expenses: [expense(50)],
      occurrences: [occurrence(300)],
    })

    await expect(harness.useCase.execute()).resolves.toEqual({
      currentBalanceCents: 1_050,
      spentCents: 50,
      committedCents: 300,
      upcomingCommittedCents: 300,
      overdueCommittedCents: 0,
      projectedAvailableCents: 750,
      expectedIncomeCents: 200,
      overdueExpectedIncomeCents: 0,
      projectedClosingBalanceCents: 950,
      projectionHorizonEnd: '2026-08-31',
      projectionCoverage: 'full_period',
    })
  })

  it('works without a current period and preserves overdue-only metrics', async () => {
    const harness = createHarness({
      periods: [
        period({
          id: oldPeriodId,
          startDate: '2026-08-01',
          endDate: '2026-08-14',
        }),
      ],
      incomes: [
        income(100, {
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
          date: '2026-08-14',
          periodId: oldPeriodId,
        }),
      ],
      occurrences: [
        occurrence(200, {
          dueDate: '2026-08-14',
          periodId: oldPeriodId,
        }),
      ],
    })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      currentBalanceCents: 1_000,
      committedCents: 200,
      upcomingCommittedCents: 0,
      overdueCommittedCents: 200,
      expectedIncomeCents: 0,
      overdueExpectedIncomeCents: 100,
      projectedAvailableCents: 800,
      projectionHorizonEnd: null,
      projectionCoverage: 'overdue_only',
    })
  })

  it('returns nullable balance projections without an anchor', async () => {
    const harness = createHarness({ anchor: null })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      currentBalanceCents: null,
      projectedAvailableCents: null,
      projectedClosingBalanceCents: null,
    })
  })

  it('returns a valid snapshot for an empty current period', async () => {
    const harness = createHarness({ anchor: anchor(0) })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      currentBalanceCents: 0,
      spentCents: 0,
      committedCents: 0,
      expectedIncomeCents: 0,
      projectedClosingBalanceCents: 0,
      projectionCoverage: 'full_period',
    })
  })

  it('supports a snapshot containing only expenses', async () => {
    const harness = createHarness({ expenses: [expense(125)] })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      currentBalanceCents: 875,
      spentCents: 125,
      projectedAvailableCents: 875,
      projectedClosingBalanceCents: 875,
    })
  })

  it('separates only-expected income into overdue and current horizon', async () => {
    const harness = createHarness({
      incomes: [
        income(50, {
          id: 'overdue',
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
          date: '2026-08-14',
        }),
        income(100, {
          id: 'today',
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
        }),
        income(200, {
          id: 'end',
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
          date: '2026-08-31',
        }),
      ],
    })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      currentBalanceCents: 1_000,
      expectedIncomeCents: 300,
      overdueExpectedIncomeCents: 50,
      projectedClosingBalanceCents: 1_300,
    })
  })

  it('keeps a pending overdue occurrence from an older period', async () => {
    const harness = createHarness({
      occurrences: [
        occurrence(275, {
          periodId: oldPeriodId,
          dueDate: '2026-08-05',
        }),
      ],
    })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      overdueCommittedCents: 275,
      committedCents: 275,
      projectedAvailableCents: 725,
    })
    expect(harness.reads.occurrences).toHaveBeenCalledTimes(1)
  })

  it('keeps an effective cross-period movement after the anchor cutoff', async () => {
    const harness = createHarness({
      periods: [
        period({ startDate: '2026-08-10' }),
        period({
          id: oldPeriodId,
          startDate: '2026-08-01',
          endDate: '2026-08-09',
        }),
      ],
      expenses: [
        expense(125, {
          periodId: oldPeriodId,
          date: '2026-08-05',
          balanceEffectiveAt: afterCutoff,
        }),
      ],
    })

    await expect(harness.useCase.execute()).resolves.toMatchObject({
      currentBalanceCents: 875,
      spentCents: 0,
    })
    expect(harness.reads.expenses).toHaveBeenCalledTimes(1)
  })

  it('propagates CurrentPeriodConflictError instead of choosing a period', async () => {
    const harness = createHarness({
      periods: [period({ id: 'first' }), period({ id: 'second' })],
    })

    await expect(harness.useCase.execute()).rejects.toBeInstanceOf(
      CurrentPeriodConflictError,
    )
  })

  it('propagates repository failures without fabricating a partial snapshot', async () => {
    const harness = createHarness()
    const repositoryError = new Error('income read failed')
    harness.reads.incomes.mockRejectedValueOnce(repositoryError)

    await expect(harness.useCase.execute()).rejects.toBe(repositoryError)
  })

  it('performs five read-only repository calls with deterministic today', async () => {
    const harness = createHarness(
      {
        periods: [
          period({
            startDate: '2026-08-15',
            endDate: '2026-08-15',
          }),
        ],
      },
      '2026-08-15T23:59:59.999Z',
    )
    const before = structuredClone(harness.data)

    const result = await harness.useCase.execute()

    expect(result.projectionCoverage).toBe('full_period')
    for (const read of Object.values(harness.reads))
      expect(read).toHaveBeenCalledTimes(1)
    expect(harness.unexpectedWrite).not.toHaveBeenCalled()
    expect(harness.data).toEqual(before)
  })

  it('propagates the D8 error for a pending legacy occurrence without amount', async () => {
    const { amount: snapshotAmount, ...legacyOccurrence } = occurrence(100)
    const harness = createHarness({ occurrences: [legacyOccurrence] })

    expect(snapshotAmount).toBe(100)
    await expect(harness.useCase.execute()).rejects.toBeInstanceOf(DomainError)
  })

  it('uses real owner-scoped repositories, owner-wide data, and repository latest-anchor ordering', async () => {
    const databaseName = 'get-financial-snapshot-integration'
    await Dexie.delete(databaseName)
    const database = new GastoClaroDB(databaseName)
    try {
      const current = period({ startDate: '2026-08-10' })
      const old = period({
        id: oldPeriodId,
        startDate: '2026-08-01',
        endDate: '2026-08-09',
      })
      await database.periods.bulkAdd([
        current,
        old,
        { ...current, id: 'other-period', ownerId: otherOwnerId },
      ])
      await database.balanceAnchors.bulkAdd([
        anchor(100, {
          id: 'anchor-a',
          capturedAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-20T00:00:00.000Z',
        }),
        anchor(500, {
          id: 'anchor-b',
          capturedAt: cutoff,
          updatedAt: '2026-08-11T00:00:00.000Z',
        }),
        anchor(700, {
          id: 'anchor-c',
          capturedAt: cutoff,
          updatedAt: '2026-08-11T00:00:00.000Z',
        }),
        anchor(9_999, {
          id: 'other-anchor',
          ownerId: otherOwnerId,
          capturedAt: '2030-01-01T00:00:00.000Z',
        }),
      ])
      await database.expenses.bulkAdd([
        expense(100, {
          id: 'owner-expense',
          periodId: oldPeriodId,
          date: '2026-08-05',
        }),
        expense(9_999, {
          id: 'other-expense',
          ownerId: otherOwnerId,
          periodId: 'other-period',
        }),
      ])
      await database.recurringPaymentOccurrences.bulkAdd([
        occurrence(200, {
          id: 'owner-overdue',
          periodId: oldPeriodId,
          dueDate: '2026-08-05',
        }),
        occurrence(9_999, {
          id: 'other-overdue',
          ownerId: otherOwnerId,
          periodId: 'other-period',
          dueDate: '2026-08-05',
        }),
      ])

      const result = await new GetFinancialSnapshot(
        new DexiePeriodRepository(database, ownerId),
        new DexieBalanceAnchorRepository(database, ownerId),
        new DexieIncomeRepository(database, ownerId),
        new DexieExpenseRepository(database, ownerId),
        new DexieRecurringPaymentOccurrenceRepository(database, ownerId),
        { now: () => afterCutoff },
      ).execute()

      expect(result).toMatchObject({
        currentBalanceCents: 600,
        spentCents: 0,
        overdueCommittedCents: 200,
        committedCents: 200,
        projectedAvailableCents: 400,
      })
    } finally {
      database.close()
      await Dexie.delete(databaseName)
    }
  })
})
