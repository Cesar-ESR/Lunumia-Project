import type {
  BalanceAnchor,
  Category,
  CategoryBudget,
  Expense,
  Income,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
  SyncOperation,
} from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'

export interface IPeriodRepository {
  create(value: Period): Promise<Period>
  update(value: Period): Promise<Period>
  delete(id: string): Promise<void>
  findById(id: string): Promise<Period | null>
  findAll(): Promise<Period[]>
  findOverlapping(
    start: DateOnly,
    end: DateOnly,
    excludeId?: string,
  ): Promise<Period[]>
  findByDateRange(date: DateOnly): Promise<Period | null>
}
export interface IIncomeRepository {
  create(value: Income): Promise<Income>
  update(value: Income): Promise<Income>
  delete(id: string): Promise<void>
  findById(id: string): Promise<Income | null>
  findAll(): Promise<Income[]>
  findByPeriod(periodId: string): Promise<Income[]>
}
export interface IExpenseRepository {
  create(value: Expense): Promise<Expense>
  update(value: Expense): Promise<Expense>
  delete(id: string): Promise<void>
  findById(id: string): Promise<Expense | null>
  findAll(): Promise<Expense[]>
  findByPeriod(periodId: string): Promise<Expense[]>
  findByCategory(categoryId: string): Promise<Expense[]>
}
export interface ICategoryRepository {
  create(value: Category): Promise<Category>
  update(value: Category): Promise<Category>
  delete(id: string): Promise<void>
  findById(id: string): Promise<Category | null>
  findAll(): Promise<Category[]>
  findByNormalizedName(name: string): Promise<Category | null>
  countExpensesByCategory(categoryId: string): Promise<number>
  findSystemCategory(): Promise<Category>
}
export interface ICategoryBudgetRepository {
  upsert(value: CategoryBudget): Promise<CategoryBudget>
  delete(id: string): Promise<void>
  findById(id: string): Promise<CategoryBudget | null>
  findByPeriod(periodId: string): Promise<CategoryBudget[]>
  findByPeriodAndCategory(
    periodId: string,
    categoryId: string,
  ): Promise<CategoryBudget | null>
}
export interface IRecurringPaymentRepository {
  create(value: RecurringPayment): Promise<RecurringPayment>
  update(value: RecurringPayment): Promise<RecurringPayment>
  delete(id: string): Promise<void>
  findById(id: string): Promise<RecurringPayment | null>
  findAll(): Promise<RecurringPayment[]>
  findActive(): Promise<RecurringPayment[]>
  findByCategory(categoryId: string): Promise<RecurringPayment[]>
}
export interface IRecurringPaymentOccurrenceRepository {
  create(value: RecurringPaymentOccurrence): Promise<RecurringPaymentOccurrence>
  update(value: RecurringPaymentOccurrence): Promise<RecurringPaymentOccurrence>
  findById(id: string): Promise<RecurringPaymentOccurrence | null>
  findAll(): Promise<RecurringPaymentOccurrence[]>
  findByPeriod(periodId: string): Promise<RecurringPaymentOccurrence[]>
  findByPaymentAndPeriod(
    paymentId: string,
    periodId: string,
  ): Promise<RecurringPaymentOccurrence[]>
  findByPaymentAndDueDate(
    paymentId: string,
    dueDate: DateOnly,
  ): Promise<RecurringPaymentOccurrence | null>
  findPendingByPeriod(periodId: string): Promise<RecurringPaymentOccurrence[]>
}
export interface IBalanceAnchorRepository {
  create(value: BalanceAnchor): Promise<BalanceAnchor>
  findById(id: string): Promise<BalanceAnchor | null>
  findLatest(): Promise<BalanceAnchor | null>
}
export interface ISyncOperationRepository {
  enqueue(value: SyncOperation): Promise<void>
  findPending(ownerId?: string): Promise<SyncOperation[]>
  countPending(ownerId?: string): Promise<number>
  findByOperationId(
    operationId: string,
    ownerId?: string,
  ): Promise<SyncOperation | null>
  markProcessing(operationId: string, ownerId?: string): Promise<void>
  markError(operationId: string, error: string, ownerId?: string): Promise<void>
  remove(operationId: string, ownerId?: string): Promise<void>
  clearByOwner(ownerId: string): Promise<void>
}
