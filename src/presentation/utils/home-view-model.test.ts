import {
  buildHomeAttentionItems,
  formatHomeEventDate,
  selectHomePrimaryAction,
  selectNextCommitment,
  selectNextExpectedIncome,
  selectRecentActivity,
} from './home-view-model'
import {
  createCategoryBudgetSummaryMock,
  createCategoryMock,
  createExpenseMock,
  createFinancialSnapshotMock,
  createIncomeMock,
  createOccurrenceMock,
  createRecurringPaymentMock,
} from '../test/test-factories'

const idleSync = {
  isAvailable: false,
  ownerId: null,
  status: 'idle' as const,
  canRetryManually: false,
  error: null,
}

describe('home-view-model', () => {
  it('selecciona la acción contextual por hechos autoritativos', () => {
    expect(
      selectHomePrimaryAction(
        createFinancialSnapshotMock({ openingBalanceCents: null }),
      ).kind,
    ).toBe('balance')
    expect(
      selectHomePrimaryAction(
        createFinancialSnapshotMock({
          openingBalanceCents: 150_000,
          overdueCommittedCents: 1,
        }),
      ).kind,
    ).toBe('commitments')
    expect(
      selectHomePrimaryAction(
        createFinancialSnapshotMock({ openingBalanceCents: 150_000 }),
      ).kind,
    ).toBe('register')
  })

  it('prioriza y limita atención sin derivar over desde importes', () => {
    const items = buildHomeAttentionItems({
      snapshot: createFinancialSnapshotMock({
        overdueCommittedCents: 10_000,
        overdueExpectedIncomeCents: 20_000,
      }),
      budgetSummaries: [
        createCategoryBudgetSummaryMock({
          categoryId: 'over-authoritative',
          remainingCents: 999_999,
          status: 'over',
        }),
        createCategoryBudgetSummaryMock({
          categoryId: 'negative-but-within',
          remainingCents: -999_999,
          status: 'within',
        }),
      ],
      categories: [
        createCategoryMock({ id: 'over-authoritative', name: 'Servicios' }),
        createCategoryMock({ id: 'negative-but-within', name: 'Comida' }),
      ],
      sync: {
        isAvailable: true,
        ownerId: 'user:1',
        status: 'error',
        canRetryManually: true,
        error: {
          kind: 'network',
          code: null,
          retryable: true,
          message: 'Reintenta la sincronización.',
        },
      },
    })

    expect(items).toEqual([
      { kind: 'overdue-commitments', amountCents: 10_000 },
      { kind: 'overdue-expected-income', amountCents: 20_000 },
      {
        kind: 'budget-over',
        categoryId: 'over-authoritative',
        categoryName: 'Servicios',
      },
    ])
  })

  it('omite atención cuando no hay hechos accionables y offline es normal', () => {
    expect(
      buildHomeAttentionItems({
        snapshot: createFinancialSnapshotMock(),
        budgetSummaries: [],
        categories: [],
        sync: { ...idleSync, status: 'offline' },
      }),
    ).toEqual([])
  })

  it('elige la ocurrencia próxima y conserva su amount snapshot', () => {
    const payment = createRecurringPaymentMock({ amount: 90_000 })
    const next = selectNextCommitment({
      payments: [payment],
      occurrences: [
        createOccurrenceMock({
          amount: 12_345,
          dueDate: '2026-08-24',
        }),
      ],
      categories: [createCategoryMock()],
      today: '2026-08-23',
    })

    expect(next?.amountCents).toBe(12_345)
    expect(next?.dateContext).toContain('Mañana')
  })

  it('elige el ingreso esperado futuro más cercano de forma determinista', () => {
    const next = selectNextExpectedIncome(
      [
        createIncomeMock({
          id: 'later',
          date: '2026-08-30',
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
        }),
        createIncomeMock({
          id: 'nearest',
          date: '2026-08-24',
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
        }),
        createIncomeMock({ id: 'received', date: '2026-08-23' }),
      ],
      '2026-08-23',
    )

    expect(next?.id).toBe('nearest')
    expect(next?.kind).toBe('income-expected')
  })

  it('reutiliza el orden U5, limita a cinco y excluye expectativas', () => {
    const activity = selectRecentActivity({
      incomes: [
        createIncomeMock({ id: 'received', date: '2026-08-25' }),
        createIncomeMock({
          id: 'expected',
          date: '2026-08-26',
          status: 'expected',
          affectsBalance: false,
          balanceEffectiveAt: null,
        }),
      ],
      expenses: Array.from({ length: 6 }, (_, index) =>
        createExpenseMock({
          id: `expense-${index}`,
          date: `2026-08-${String(24 - index).padStart(2, '0')}`,
        }),
      ),
      categories: [createCategoryMock()],
    })

    expect(activity).toHaveLength(5)
    expect(activity.map(({ id }) => id)).toEqual([
      'received',
      'expense-0',
      'expense-1',
      'expense-2',
      'expense-3',
    ])
    expect(activity.some(({ id }) => id === 'expected')).toBe(false)
  })

  it('presenta fechas DateOnly relativas sin conversión local', () => {
    expect(formatHomeEventDate('2026-08-23', '2026-08-23')).toBe('Hoy')
    expect(formatHomeEventDate('2026-08-24', '2026-08-23')).toBe('Mañana')
    expect(formatHomeEventDate('2026-08-25', '2026-08-23')).toContain('25 ago')
  })
})
