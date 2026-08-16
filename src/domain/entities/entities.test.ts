import type {
  BalanceAnchor,
  ExpenseV2,
  IncomeStatus,
  IncomeV2,
  LegacyExpense,
  LegacyIncome,
  LegacyRecurringPaymentOccurrence,
  RecurringPaymentOccurrenceV2,
} from '@domain/entities'
import type {
  AmountCents,
  Instant,
  SignedMoneyCents,
} from '@domain/value-objects'
import { describe, expect, expectTypeOf, it } from 'vitest'

type HasRequiredKey<T, Key extends PropertyKey> =
  T extends Record<Key, unknown> ? true : false

const syncable = {
  ownerId: 'owner-a',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
} as const

describe('contratos de dominio 2.0', () => {
  it('congela exactamente los tres IncomeStatus persistidos', () => {
    expectTypeOf<IncomeStatus>().toEqualTypeOf<
      'expected' | 'received' | 'cancelled'
    >()
  })

  it('representa expected, received y cancelled mediante IncomeV2', () => {
    const expected: IncomeV2 = {
      ...syncable,
      id: 'expected',
      periodId: 'period-a',
      amount: 1_000_00,
      description: 'Ingreso esperado',
      date: '2026-08-15',
      status: 'expected',
      affectsBalance: false,
      balanceEffectiveAt: null,
    }
    const received: IncomeV2 = {
      ...expected,
      id: 'received',
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: '2026-08-15T12:00:00.000Z',
    }
    const cancelled: IncomeV2 = {
      ...expected,
      id: 'cancelled',
      status: 'cancelled',
    }

    expect([expected.status, received.status, cancelled.status]).toEqual([
      'expected',
      'received',
      'cancelled',
    ])
    expect([expected.affectsBalance, received.affectsBalance]).toEqual([
      false,
      true,
    ])
    expectTypeOf<
      Pick<IncomeV2, 'status' | 'affectsBalance' | 'balanceEffectiveAt'>
    >().toEqualTypeOf<{
      status: IncomeStatus
      affectsBalance: boolean
      balanceEffectiveAt: Instant | null
    }>()
  })

  it('requiere balanceEffectiveAt no nullable en ExpenseV2', () => {
    const expense: ExpenseV2 = {
      ...syncable,
      id: 'expense-a',
      periodId: 'period-a',
      categoryId: 'category-a',
      amount: 500_00,
      description: 'Gasto',
      date: '2026-08-15',
      recurringOccurrenceId: null,
      affectsBalance: true,
      balanceEffectiveAt: '2026-08-15T12:00:00.000Z',
    }

    expect(expense.affectsBalance).toBe(true)
    expectTypeOf<ExpenseV2['balanceEffectiveAt']>().toEqualTypeOf<Instant>()
    expectTypeOf<
      HasRequiredKey<ExpenseV2, 'affectsBalance'>
    >().toEqualTypeOf<true>()
  })

  it.each([100_000, 0, -25_000])(
    'BalanceAnchor representa el saldo con signo %i',
    (amount) => {
      const anchor: BalanceAnchor = {
        ...syncable,
        id: `anchor-${amount}`,
        amount,
        capturedAt: '2026-08-15T12:00:00.000Z',
        ledgerCutoffAt: '2026-08-15T11:59:59.999Z',
      }

      expect(anchor.amount).toBe(amount)
      expectTypeOf<
        Pick<BalanceAnchor, 'amount' | 'capturedAt' | 'ledgerCutoffAt'>
      >().toEqualTypeOf<{
        amount: SignedMoneyCents
        capturedAt: Instant
        ledgerCutoffAt: Instant
      }>()
    },
  )

  it('OccurrenceV2 exige amount y conserva transactionId temporalmente', () => {
    const strict: RecurringPaymentOccurrenceV2 = {
      ...syncable,
      id: 'occurrence-v2',
      recurringPaymentId: 'payment-a',
      periodId: 'period-a',
      dueDate: '2026-08-15',
      status: 'pending',
      amount: 300_00,
      transactionId: null,
    }
    const legacy: LegacyRecurringPaymentOccurrence = {
      ...syncable,
      id: 'occurrence-legacy',
      recurringPaymentId: 'payment-a',
      periodId: 'period-a',
      dueDate: '2026-08-15',
      status: 'paid',
      transactionId: 'expense-a',
    }

    expect(strict.amount).toBe(300_00)
    expect(legacy.transactionId).toBe('expense-a')
    expectTypeOf<
      RecurringPaymentOccurrenceV2['amount']
    >().toEqualTypeOf<AmountCents>()
  })
})

describe('TEMPORARY DOMAIN 2.0 MIGRATION BOUNDARY', () => {
  it('permite Income legacy sin campos 2.0 y los exige en IncomeV2', () => {
    const legacy: LegacyIncome = {
      ...syncable,
      id: 'income-legacy',
      periodId: 'period-a',
      amount: 1_000_00,
      description: 'Legacy',
      date: '2026-08-15',
    }

    expect(legacy.id).toBe('income-legacy')
    expectTypeOf<
      HasRequiredKey<LegacyIncome, 'status'>
    >().toEqualTypeOf<false>()
    expectTypeOf<HasRequiredKey<IncomeV2, 'status'>>().toEqualTypeOf<true>()
    expectTypeOf<
      HasRequiredKey<IncomeV2, 'balanceEffectiveAt'>
    >().toEqualTypeOf<true>()
  })

  it('permite Expense legacy sin campos 2.0 y los exige en ExpenseV2', () => {
    const legacy: LegacyExpense = {
      ...syncable,
      id: 'expense-legacy',
      periodId: 'period-a',
      categoryId: 'category-a',
      amount: 500_00,
      description: 'Legacy',
      date: '2026-08-15',
      recurringOccurrenceId: null,
    }

    expect(legacy.id).toBe('expense-legacy')
    expectTypeOf<
      HasRequiredKey<LegacyExpense, 'affectsBalance'>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      HasRequiredKey<ExpenseV2, 'affectsBalance'>
    >().toEqualTypeOf<true>()
  })

  it('permite Occurrence legacy sin amount y lo exige en OccurrenceV2', () => {
    expectTypeOf<
      HasRequiredKey<LegacyRecurringPaymentOccurrence, 'amount'>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      HasRequiredKey<RecurringPaymentOccurrenceV2, 'amount'>
    >().toEqualTypeOf<true>()
  })
})
