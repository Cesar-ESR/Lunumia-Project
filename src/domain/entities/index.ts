import type {
  AmountCents,
  DateOnly,
  Instant,
  SignedMoneyCents,
} from '@domain/value-objects'

export type PeriodType = 'monthly' | 'biweekly'
export type Frequency = 'weekly' | 'biweekly' | 'monthly'
export type OccurrenceStatus = 'pending' | 'paid' | 'skipped'
export type IncomeStatus = 'expected' | 'received' | 'cancelled'
export type PeriodTemporalState = 'future' | 'active' | 'ended'
export type PaymentStatus = 'active' | 'inactive'
export type SyncStatus = 'synced' | 'pending' | 'error'
export type SyncOperationType =
  'create' | 'update' | 'delete' | 'pay_recurring_occurrence'
export type SyncOperationStatus = 'pending' | 'processing' | 'error'
export type SyncEntityType =
  | 'period'
  | 'income'
  | 'expense'
  | 'category'
  | 'categoryBudget'
  | 'recurringPayment'
  | 'recurringPaymentOccurrence'
  | 'balanceAnchor'
  | 'userSettings'

export interface SyncableEntity {
  id: string
  ownerId: string
  createdAt: Instant
  updatedAt: Instant
  deletedAt: Instant | null
  syncStatus: SyncStatus
}
export interface Period extends SyncableEntity {
  type: PeriodType
  startDate: DateOnly
  endDate: DateOnly
}
interface IncomeBase extends SyncableEntity {
  periodId: string
  amount: AmountCents
  description: string
  date: DateOnly
}
export interface IncomeV2 extends IncomeBase {
  status: IncomeStatus
  affectsBalance: boolean
  balanceEffectiveAt: Instant | null
}
/**
 * Temporary compatibility contract for records created before Lunumia 2.0.
 * Persistence migrations will convert these records in later phases.
 */
export type LegacyIncome = IncomeBase
/** Temporary read/write boundary until legacy persistence is migrated. */
export type Income = IncomeV2 | LegacyIncome
export type PersistedIncome = Income
interface ExpenseBase extends SyncableEntity {
  periodId: string
  categoryId: string
  amount: AmountCents
  description: string
  date: DateOnly
  recurringOccurrenceId: string | null
}
export interface ExpenseV2 extends ExpenseBase {
  affectsBalance: boolean
  balanceEffectiveAt: Instant
}
/**
 * Temporary compatibility contract for records created before Lunumia 2.0.
 * Persistence migrations will convert these records in later phases.
 */
export type LegacyExpense = ExpenseBase
/** Temporary read/write boundary until legacy persistence is migrated. */
export type Expense = ExpenseV2 | LegacyExpense
export type PersistedExpense = Expense
export interface Category extends SyncableEntity {
  name: string
  normalizedName: string
  color: string
  icon: string | null
  isSystem: boolean
}
export interface CategoryBudget extends SyncableEntity {
  periodId: string
  categoryId: string
  amount: AmountCents
}
export interface RecurringPayment extends SyncableEntity {
  name: string
  amount: AmountCents
  frequency: Frequency
  dueDate: DateOnly
  endDate: DateOnly | null
  categoryId: string
  status: PaymentStatus
}
interface RecurringPaymentOccurrenceBase extends SyncableEntity {
  recurringPaymentId: string
  periodId: string
  dueDate: DateOnly
  status: OccurrenceStatus
  /**
   * @deprecated Legacy local compatibility.
   * The authoritative relation is Expense.recurringOccurrenceId.
   */
  transactionId: string | null
}
export interface RecurringPaymentOccurrenceV2 extends RecurringPaymentOccurrenceBase {
  amount: AmountCents
}
/**
 * Temporary compatibility contract for occurrences generated before Lunumia 2.0.
 * Persistence migrations will backfill their amount in a later phase.
 */
export type LegacyRecurringPaymentOccurrence = RecurringPaymentOccurrenceBase
/** Temporary read/write boundary until legacy persistence is migrated. */
export type RecurringPaymentOccurrence =
  RecurringPaymentOccurrenceV2 | LegacyRecurringPaymentOccurrence
export type PersistedRecurringPaymentOccurrence = RecurringPaymentOccurrence
export interface BalanceAnchor extends SyncableEntity {
  amount: SignedMoneyCents
  capturedAt: Instant
  ledgerCutoffAt: Instant
}
export interface SyncOperation {
  operationId: string
  ownerId: string
  entityType: SyncEntityType
  entityId: string
  operationType: SyncOperationType
  payload: string
  createdAt: Instant
  status: SyncOperationStatus
  errorMessage: string | null
  retryCount: number
}
export interface UserSettings {
  id: string
  ownerId: string
  activePeriodId: string | null
  currency: string
  theme: 'light' | 'dark' | 'system'
  createdAt: Instant
  updatedAt: Instant
}
export interface SyncCursor {
  lastUpdatedAt: Instant | null
  lastEntityId: string | null
}
export interface DeviceSyncState extends SyncCursor {
  id: string
  ownerId: string
  entityType: SyncEntityType
  lastSuccessfulSyncAt: Instant | null
}
