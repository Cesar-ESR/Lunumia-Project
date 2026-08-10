import type { AmountCents, DateOnly, Instant } from '@domain/value-objects'

export type PeriodType = 'monthly' | 'biweekly'
export type Frequency = 'weekly' | 'biweekly' | 'monthly'
export type OccurrenceStatus = 'pending' | 'paid' | 'skipped'
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
export interface Income extends SyncableEntity {
  periodId: string
  amount: AmountCents
  description: string
  date: DateOnly
}
export interface Expense extends SyncableEntity {
  periodId: string
  categoryId: string
  amount: AmountCents
  description: string
  date: DateOnly
  recurringOccurrenceId: string | null
}
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
export interface RecurringPaymentOccurrence extends SyncableEntity {
  recurringPaymentId: string
  periodId: string
  dueDate: DateOnly
  status: OccurrenceStatus
  transactionId: string | null
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
