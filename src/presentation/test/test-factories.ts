import { vi } from 'vitest'
import type { ApplicationServices } from '../../app/composition-root'
import type {
  BalanceAnchor,
  Category,
  CategoryBudget,
  Expense,
  ExpenseV2,
  Income,
  IncomeV2,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
  RecurringPaymentOccurrenceV2,
  UserSettings,
} from '@domain/entities'
import type { DashboardBudgetSummary } from '@application/use-cases/dashboard/GetDashboardBudgetSummary'
import type { FinancialSnapshot } from '@domain/calculations'

export const OWNER_ID = 'guest:test-owner'
export const PERIOD_ID = '11111111-1111-4111-8111-111111111111'
export const CATEGORY_ID = '22222222-2222-4222-8222-222222222222'
export const EXPENSE_ID = '33333333-3333-4333-8333-333333333333'
const NOW = '2026-07-01T00:00:00.000Z'

const syncable = {
  ownerId: OWNER_ID,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  syncStatus: 'pending' as const,
}
export const createPeriodMock = (overrides: Partial<Period> = {}): Period => ({
  id: PERIOD_ID,
  type: 'monthly',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  ...syncable,
  ...overrides,
})
export const createCategoryMock = (
  overrides: Partial<Category> = {},
): Category => ({
  id: CATEGORY_ID,
  name: 'Comida',
  normalizedName: 'comida',
  color: '#2f6fed',
  icon: null,
  isSystem: false,
  ...syncable,
  ...overrides,
})
export const createExpenseMock = (
  overrides: Partial<Expense> = {},
): ExpenseV2 => ({
  id: EXPENSE_ID,
  periodId: PERIOD_ID,
  categoryId: CATEGORY_ID,
  amount: 12500,
  description: 'Supermercado',
  date: '2026-07-10',
  recurringOccurrenceId: null,
  affectsBalance: true,
  balanceEffectiveAt: NOW,
  ...syncable,
  ...overrides,
})
export const createIncomeMock = (
  overrides: Partial<Income> = {},
): IncomeV2 => ({
  id: '44444444-4444-4444-8444-444444444444',
  periodId: PERIOD_ID,
  amount: 200000,
  description: 'Sueldo',
  date: '2026-07-01',
  status: 'received',
  affectsBalance: true,
  balanceEffectiveAt: NOW,
  ...syncable,
  ...overrides,
})
export const createBudgetMock = (
  overrides: Partial<CategoryBudget> = {},
): CategoryBudget => ({
  id: '55555555-5555-4555-8555-555555555555',
  periodId: PERIOD_ID,
  categoryId: CATEGORY_ID,
  amount: 60000,
  ...syncable,
  ...overrides,
})
export const createRecurringPaymentMock = (
  overrides: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Internet',
  amount: 50000,
  frequency: 'monthly',
  dueDate: '2026-07-15',
  endDate: null,
  categoryId: CATEGORY_ID,
  status: 'active',
  ...syncable,
  ...overrides,
})
export const createOccurrenceMock = (
  overrides: Partial<RecurringPaymentOccurrence> = {},
): RecurringPaymentOccurrenceV2 => ({
  id: '77777777-7777-4777-8777-777777777777',
  recurringPaymentId: '66666666-6666-4666-8666-666666666666',
  periodId: PERIOD_ID,
  dueDate: '2026-07-15',
  status: 'pending',
  amount: 50000,
  transactionId: null,
  ...syncable,
  ...overrides,
})
export const createDashboardBudgetSummaryMock = (
  overrides: Partial<DashboardBudgetSummary> = {},
): DashboardBudgetSummary => ({
  totalBudget: 100000,
  budgetRemaining: 65000,
  spendingPace: { spentPercentage: 35, timePercentage: 50, pace: 'low' },
  ...overrides,
})

export const createFinancialSnapshotMock = (
  overrides: Partial<FinancialSnapshot> = {},
): FinancialSnapshot => ({
  currentBalanceCents: 125000,
  spentCents: 25000,
  committedCents: 10000,
  upcomingCommittedCents: 10000,
  overdueCommittedCents: 0,
  projectedAvailableCents: 115000,
  expectedIncomeCents: 0,
  overdueExpectedIncomeCents: 0,
  projectedClosingBalanceCents: 115000,
  projectionHorizonEnd: '2026-07-31',
  projectionCoverage: 'full_period',
  ...overrides,
})

export function createApplicationServicesMock({
  activePeriod = createPeriodMock(),
  budgetSummary = createDashboardBudgetSummaryMock(),
  financialSnapshot = createFinancialSnapshotMock(),
}: {
  activePeriod?: Period | null
  budgetSummary?: DashboardBudgetSummary
  financialSnapshot?: FinancialSnapshot
} = {}) {
  const category = createCategoryMock()
  const expense = createExpenseMock()
  const income = createIncomeMock()
  const budget = createBudgetMock()
  const payment = createRecurringPaymentMock()
  const occurrence = createOccurrenceMock()
  const anchor: BalanceAnchor = {
    id: '99999999-9999-4999-8999-999999999999',
    amount: 150000,
    capturedAt: NOW,
    ledgerCutoffAt: NOW,
    ...syncable,
  }
  const settings: UserSettings = {
    id: '88888888-8888-4888-8888-888888888888',
    ownerId: OWNER_ID,
    activePeriodId: activePeriod?.id ?? null,
    currency: 'MXN',
    theme: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }
  const getBudgetSummary = vi
    .fn<ApplicationServices['dashboard']['getBudgetSummary']['execute']>()
    .mockResolvedValue(budgetSummary)
  const getFinancialSnapshot = vi
    .fn<ApplicationServices['dashboard']['getFinancialSnapshot']['execute']>()
    .mockResolvedValue(financialSnapshot)
  const createExpense = vi
    .fn<ApplicationServices['expenses']['createExpense']['execute']>()
    .mockResolvedValue(expense)
  const prepareReceiptImage = vi
    .fn<ApplicationServices['receipts']['prepareImage']['execute']>()
    .mockResolvedValue(null)
  const recognizeReceipt =
    vi.fn<ApplicationServices['receipts']['recognizeReceipt']['execute']>()
  const createRecurringPayment = vi
    .fn<
      ApplicationServices['recurringPayments']['createRecurringPayment']['execute']
    >()
    .mockResolvedValue(payment)
  const markOccurrenceAsPaid = vi
    .fn<
      ApplicationServices['recurringPayments']['markOccurrenceAsPaid']['execute']
    >()
    .mockResolvedValue({
      occurrence: createOccurrenceMock({ status: 'paid' }),
      expense,
    })
  const services: ApplicationServices = {
    ownerId: OWNER_ID,
    initialize: {
      execute: vi
        .fn<ApplicationServices['initialize']['execute']>()
        .mockResolvedValue(undefined),
    },
    settings: {
      getUserSettings: {
        execute: vi
          .fn<ApplicationServices['settings']['getUserSettings']['execute']>()
          .mockResolvedValue(settings),
      },
    },
    balance: {
      setCurrentBalance: {
        execute: vi
          .fn<ApplicationServices['balance']['setCurrentBalance']['execute']>()
          .mockResolvedValue(anchor),
      },
      reconcileCurrentBalance: {
        execute: vi
          .fn<
            ApplicationServices['balance']['reconcileCurrentBalance']['execute']
          >()
          .mockResolvedValue(anchor),
      },
    },
    periods: {
      createPeriod: {
        execute: vi
          .fn<ApplicationServices['periods']['createPeriod']['execute']>()
          .mockResolvedValue(activePeriod ?? createPeriodMock()),
      },
      updatePeriod: {
        execute:
          vi.fn<ApplicationServices['periods']['updatePeriod']['execute']>(),
      },
      deletePeriod: {
        execute:
          vi.fn<ApplicationServices['periods']['deletePeriod']['execute']>(),
      },
      listPeriods: {
        execute: vi
          .fn<ApplicationServices['periods']['listPeriods']['execute']>()
          .mockResolvedValue(activePeriod ? [activePeriod] : []),
      },
      setActivePeriod: {
        execute: vi
          .fn<ApplicationServices['periods']['setActivePeriod']['execute']>()
          .mockResolvedValue(settings),
      },
    },
    incomes: {
      createIncome: {
        execute: vi
          .fn<ApplicationServices['incomes']['createIncome']['execute']>()
          .mockResolvedValue(income),
      },
      createExpectedIncome: {
        execute: vi
          .fn<
            ApplicationServices['incomes']['createExpectedIncome']['execute']
          >()
          .mockResolvedValue({
            ...income,
            status: 'expected',
            affectsBalance: false,
            balanceEffectiveAt: null,
          }),
      },
      markIncomeAsReceived: {
        execute: vi
          .fn<
            ApplicationServices['incomes']['markIncomeAsReceived']['execute']
          >()
          .mockResolvedValue(income),
      },
      cancelExpectedIncome: {
        execute: vi
          .fn<
            ApplicationServices['incomes']['cancelExpectedIncome']['execute']
          >()
          .mockResolvedValue({
            ...income,
            status: 'cancelled',
            affectsBalance: false,
            balanceEffectiveAt: null,
          }),
      },
      updateIncome: {
        execute: vi
          .fn<ApplicationServices['incomes']['updateIncome']['execute']>()
          .mockResolvedValue(income),
      },
      deleteIncome: {
        execute: vi
          .fn<ApplicationServices['incomes']['deleteIncome']['execute']>()
          .mockResolvedValue(undefined),
      },
      listIncomesByPeriod: {
        execute: vi
          .fn<
            ApplicationServices['incomes']['listIncomesByPeriod']['execute']
          >()
          .mockResolvedValue([income]),
      },
    },
    expenses: {
      createExpense: { execute: createExpense },
      updateExpense: {
        execute: vi
          .fn<ApplicationServices['expenses']['updateExpense']['execute']>()
          .mockResolvedValue(expense),
      },
      deleteExpense: {
        execute: vi
          .fn<ApplicationServices['expenses']['deleteExpense']['execute']>()
          .mockResolvedValue(undefined),
      },
      listExpensesByPeriod: {
        execute: vi
          .fn<
            ApplicationServices['expenses']['listExpensesByPeriod']['execute']
          >()
          .mockResolvedValue([expense]),
      },
    },
    categories: {
      createCategory: {
        execute: vi
          .fn<ApplicationServices['categories']['createCategory']['execute']>()
          .mockResolvedValue(category),
      },
      updateCategory: {
        execute: vi
          .fn<ApplicationServices['categories']['updateCategory']['execute']>()
          .mockResolvedValue(category),
      },
      deleteCategory: {
        execute: vi
          .fn<ApplicationServices['categories']['deleteCategory']['execute']>()
          .mockResolvedValue(undefined),
      },
      listCategories: {
        execute: vi
          .fn<ApplicationServices['categories']['listCategories']['execute']>()
          .mockResolvedValue([category]),
      },
      countCategoryExpenses: {
        execute: vi
          .fn<
            ApplicationServices['categories']['countCategoryExpenses']['execute']
          >()
          .mockResolvedValue(0),
      },
    },
    budgets: {
      upsertCategoryBudget: {
        execute: vi
          .fn<
            ApplicationServices['budgets']['upsertCategoryBudget']['execute']
          >()
          .mockResolvedValue(budget),
      },
      deleteCategoryBudget: {
        execute: vi
          .fn<
            ApplicationServices['budgets']['deleteCategoryBudget']['execute']
          >()
          .mockResolvedValue(undefined),
      },
      listBudgetsByPeriod: {
        execute: vi
          .fn<
            ApplicationServices['budgets']['listBudgetsByPeriod']['execute']
          >()
          .mockResolvedValue([budget]),
      },
    },
    recurringPayments: {
      createRecurringPayment: { execute: createRecurringPayment },
      updateRecurringPayment: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['updateRecurringPayment']['execute']
          >()
          .mockResolvedValue(payment),
      },
      deleteRecurringPayment: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['deleteRecurringPayment']['execute']
          >()
          .mockResolvedValue(undefined),
      },
      toggleRecurringPaymentStatus: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['toggleRecurringPaymentStatus']['execute']
          >()
          .mockResolvedValue(payment),
      },
      generateOccurrencesForPeriod: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['generateOccurrencesForPeriod']['execute']
          >()
          .mockResolvedValue({ created: [], skippedExisting: 0 }),
      },
      markOccurrenceAsPaid: { execute: markOccurrenceAsPaid },
      markOccurrenceAsSkipped: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['markOccurrenceAsSkipped']['execute']
          >()
          .mockResolvedValue(createOccurrenceMock({ status: 'skipped' })),
      },
      listRecurringPayments: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['listRecurringPayments']['execute']
          >()
          .mockResolvedValue([payment]),
      },
      listOccurrencesByPeriod: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['listOccurrencesByPeriod']['execute']
          >()
          .mockResolvedValue([occurrence]),
      },
      getOverview: {
        execute: vi
          .fn<
            ApplicationServices['recurringPayments']['getOverview']['execute']
          >()
          .mockResolvedValue({
            payments: [payment],
            occurrences: [occurrence],
          }),
      },
    },
    dashboard: {
      getBudgetSummary: { execute: getBudgetSummary },
      getFinancialSnapshot: { execute: getFinancialSnapshot },
    },
    simulator: {
      simulatePurchase: {
        execute: vi
          .fn<ApplicationServices['simulator']['simulatePurchase']['execute']>()
          .mockResolvedValue({
            projectedAvailableBeforePurchase: 125000,
            projectedAvailableAfterPurchase: 115000,
            financialAffordability: 'within',
            categoryBudgetBefore: 50000,
            categoryBudgetAfter: 40000,
            budgetFit: 'within',
            projectionCoverage: 'full_period',
            projectionHorizonEnd: activePeriod?.endDate ?? null,
          }),
      },
    },
    backup: {
      exportBackup: vi.fn<ApplicationServices['backup']['exportBackup']>(),
      serialize: vi.fn<ApplicationServices['backup']['serialize']>(),
      prepareImport: vi.fn<ApplicationServices['backup']['prepareImport']>(),
      importBackup: vi.fn<ApplicationServices['backup']['importBackup']>(),
      readFile: vi.fn<ApplicationServices['backup']['readFile']>(),
      download: vi.fn<ApplicationServices['backup']['download']>(),
    },
    receipts: {
      prepareImage: { execute: prepareReceiptImage },
      recognizeReceipt: { execute: recognizeReceipt },
    },
    aiData: {
      preparePeriodSummary: {
        execute: vi.fn().mockResolvedValue({
          totalIncome: income.amount,
          totalExpenses: expense.amount,
          categoryBreakdown: [],
          topExpenses: [],
          periodType: activePeriod?.type ?? 'monthly',
          startDate: activePeriod?.startDate ?? '2026-07-01',
          endDate: activePeriod?.endDate ?? '2026-07-31',
        }),
      },
      prepareCategoryChanges: {
        execute: vi.fn().mockResolvedValue([]),
      },
    },
    aiInsights: null,
    sync: null,
    syncOrchestrator: null,
    externalUrls: {
      openExternalUrl: vi.fn(async () => undefined),
    },
  }
  return {
    services,
    mocks: {
      getBudgetSummary,
      getFinancialSnapshot,
      createExpense,
      prepareReceiptImage,
      recognizeReceipt,
      createRecurringPayment,
      markOccurrenceAsPaid,
    },
  }
}
