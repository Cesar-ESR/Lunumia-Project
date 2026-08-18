import fc from 'fast-check'
import type {
  BalanceAnchor,
  CategoryBudget,
  ExpenseV2,
  IncomeV2,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrenceV2,
} from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

export const PROPERTY_RUNS = 100
export const OWNER_ID = '10000000-0000-4000-8000-000000000001'
export const PERIOD_ID = '20000000-0000-4000-8000-000000000002'
export const TODAY: DateOnly = '2026-08-15'
export const PERIOD_END: DateOnly = '2026-08-31'
export const CUTOFF = '2026-08-10T00:00:00.000Z'
export const BEFORE_CUTOFF = '2026-08-09T23:59:59.999Z'
export const AFTER_CUTOFF = '2026-08-15T12:00:00.000Z'
export const DELETED_AT = '2026-08-20T00:00:00.000Z'

const base = {
  ownerId: OWNER_ID,
  createdAt: CUTOFF,
  updatedAt: CUTOFF,
  deletedAt: null,
  syncStatus: 'synced' as const,
}

export const positiveCentsArbitrary = fc.integer({
  min: 1,
  max: 1_000_000,
})
export const amountCentsArbitrary = fc.integer({
  min: 0,
  max: 1_000_000,
})
export const signedCentsArbitrary = fc.integer({
  min: -1_000_000,
  max: 1_000_000,
})

export const makePeriod = (overrides: Partial<Period> = {}): Period => ({
  ...base,
  id: PERIOD_ID,
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: PERIOD_END,
  ...overrides,
})

export const makeAnchor = (
  amount: number,
  overrides: Partial<BalanceAnchor> = {},
): BalanceAnchor => ({
  ...base,
  id: '30000000-0000-4000-8000-000000000003',
  amount,
  capturedAt: CUTOFF,
  ledgerCutoffAt: CUTOFF,
  ...overrides,
})

export const makeIncome = (
  amount: number,
  overrides: Partial<IncomeV2> = {},
): IncomeV2 => ({
  ...base,
  id: '40000000-0000-4000-8000-000000000004',
  periodId: PERIOD_ID,
  amount,
  description: 'Ingreso',
  date: TODAY,
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: AFTER_CUTOFF,
  ...overrides,
})

export const makeExpense = (
  amount: number,
  overrides: Partial<ExpenseV2> = {},
): ExpenseV2 => ({
  ...base,
  id: '50000000-0000-4000-8000-000000000005',
  periodId: PERIOD_ID,
  categoryId: '60000000-0000-4000-8000-000000000006',
  amount,
  description: 'Gasto',
  date: TODAY,
  recurringOccurrenceId: null,
  affectsBalance: true,
  balanceEffectiveAt: AFTER_CUTOFF,
  ...overrides,
})

export const makeBudget = (
  amount: number,
  overrides: Partial<CategoryBudget> = {},
): CategoryBudget => ({
  ...base,
  id: '90000000-0000-4000-8000-000000000009',
  periodId: PERIOD_ID,
  categoryId: '60000000-0000-4000-8000-000000000006',
  amount,
  ...overrides,
})

export const makeOccurrence = (
  amount: number,
  overrides: Partial<RecurringPaymentOccurrenceV2> = {},
): RecurringPaymentOccurrenceV2 => ({
  ...base,
  id: '70000000-0000-4000-8000-000000000007',
  recurringPaymentId: '80000000-0000-4000-8000-000000000008',
  periodId: PERIOD_ID,
  dueDate: TODAY,
  status: 'pending',
  amount,
  transactionId: null,
  ...overrides,
})

export const makePayment = (
  amount: number,
  overrides: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  ...base,
  id: '80000000-0000-4000-8000-000000000008',
  name: 'Pago recurrente',
  amount,
  frequency: 'monthly',
  dueDate: TODAY,
  endDate: null,
  categoryId: '60000000-0000-4000-8000-000000000006',
  status: 'active',
  ...overrides,
})

const dateArbitrary = fc.constantFrom<DateOnly>(
  '2026-08-01',
  '2026-08-14',
  TODAY,
  '2026-08-20',
  PERIOD_END,
  '2026-09-01',
)

export const incomeArbitrary: fc.Arbitrary<IncomeV2> = fc
  .record({
    id: fc.uuid(),
    amount: positiveCentsArbitrary,
    date: dateArbitrary,
    status: fc.constantFrom<IncomeV2['status']>(
      'expected',
      'received',
      'cancelled',
    ),
    receivedAffectsBalance: fc.boolean(),
    deleted: fc.boolean(),
  })
  .map((value) =>
    makeIncome(value.amount, {
      id: value.id,
      date: value.date,
      status: value.status,
      affectsBalance:
        value.status === 'received' && value.receivedAffectsBalance,
      balanceEffectiveAt: value.status === 'received' ? AFTER_CUTOFF : null,
      deletedAt: value.deleted ? DELETED_AT : null,
    }),
  )

export const expenseArbitrary: fc.Arbitrary<ExpenseV2> = fc
  .record({
    id: fc.uuid(),
    amount: positiveCentsArbitrary,
    date: dateArbitrary,
    affectsBalance: fc.boolean(),
    deleted: fc.boolean(),
  })
  .map((value) =>
    makeExpense(value.amount, {
      id: value.id,
      date: value.date,
      affectsBalance: value.affectsBalance,
      deletedAt: value.deleted ? DELETED_AT : null,
    }),
  )

export const occurrenceArbitrary: fc.Arbitrary<RecurringPaymentOccurrenceV2> =
  fc
    .record({
      id: fc.uuid(),
      amount: positiveCentsArbitrary,
      dueDate: dateArbitrary,
      status: fc.constantFrom<RecurringPaymentOccurrenceV2['status']>(
        'pending',
        'paid',
        'skipped',
      ),
      deleted: fc.boolean(),
    })
    .map((value) =>
      makeOccurrence(value.amount, {
        id: value.id,
        dueDate: value.dueDate,
        status: value.status,
        deletedAt: value.deleted ? DELETED_AT : null,
      }),
    )

export const paymentArbitrary: fc.Arbitrary<RecurringPayment> = fc
  .record({
    id: fc.uuid(),
    amount: positiveCentsArbitrary,
    dueDate: dateArbitrary,
    frequency: fc.constantFrom<RecurringPayment['frequency']>(
      'weekly',
      'biweekly',
      'monthly',
    ),
    status: fc.constantFrom<RecurringPayment['status']>('active', 'inactive'),
    deleted: fc.boolean(),
    bounded: fc.boolean(),
  })
  .map((value) =>
    makePayment(value.amount, {
      id: value.id,
      dueDate: value.dueDate,
      frequency: value.frequency,
      status: value.status,
      deletedAt: value.deleted ? DELETED_AT : null,
      endDate: value.bounded ? PERIOD_END : null,
    }),
  )

export const financialInputArbitrary = fc
  .record({
    anchorAmount: signedCentsArbitrary,
    incomes: fc.array(incomeArbitrary, { maxLength: 12 }),
    expenses: fc.array(expenseArbitrary, { maxLength: 12 }),
    occurrences: fc.array(occurrenceArbitrary, { maxLength: 12 }),
  })
  .map((value) => ({
    today: TODAY,
    currentPeriod: makePeriod(),
    anchor: makeAnchor(value.anchorAmount),
    incomes: value.incomes,
    expenses: value.expenses,
    occurrences: value.occurrences,
  }))

export const paymentArrayArbitrary = fc.uniqueArray(paymentArbitrary, {
  selector: (payment) => payment.id,
  maxLength: 10,
})

const augustDate = (day: number): DateOnly =>
  `2026-08-${String(day).padStart(2, '0')}`

export const projectionRangeArbitrary = fc
  .integer({ min: 1, max: 28 })
  .chain((startDay) =>
    fc.integer({ min: startDay, max: 28 }).map((endDay) => ({
      startDate: augustDate(startDay),
      endDate: augustDate(endDay),
    })),
  )
