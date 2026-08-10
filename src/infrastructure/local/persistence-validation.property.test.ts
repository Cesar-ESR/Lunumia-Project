import Dexie from 'dexie'
import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import {
  nonNegativeCentsSchema,
  positiveCentsSchema,
} from '@application/contracts/common.schema'
import { CreateCategory } from '@application/use-cases/categories/CreateCategory'
import type {
  Category,
  CategoryBudget,
  Expense,
  Income,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import { CategoryDuplicateError } from '@domain/errors'
import { GastoClaroDB } from './database'
import {
  DexieCategoryBudgetRepository,
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexiePeriodRepository,
  DexieRecurringPaymentOccurrenceRepository,
  DexieRecurringPaymentRepository,
} from './repositories'

const RUNS = 100
const instant = '2026-01-01T00:00:00.000Z'
const identifierArbitrary = fc.uuid()
const textArbitrary = fc.stringMatching(/^[A-Za-z0-9]{1,40}$/)
const dateOnlyArbitrary = fc.integer({ min: 0, max: 3_650 }).map((offset) => {
  const date = new Date(Date.UTC(2020, 0, 1 + offset))
  return date.toISOString().slice(0, 10)
})
const positiveAmountArbitrary = fc.integer({ min: 1, max: 1_000_000_000 })
const budgetAmountArbitrary = fc.integer({ min: 0, max: 1_000_000_000 })

interface EntitySet {
  period: Period
  income: Income
  expense: Expense
  category: Category
  budget: CategoryBudget
  payment: RecurringPayment
  occurrence: RecurringPaymentOccurrence
}

const entitySetArbitrary: fc.Arbitrary<EntitySet> = fc
  .record({
    ownerId: identifierArbitrary,
    periodId: identifierArbitrary,
    incomeId: identifierArbitrary,
    expenseId: identifierArbitrary,
    categoryId: identifierArbitrary,
    budgetId: identifierArbitrary,
    paymentId: identifierArbitrary,
    occurrenceId: identifierArbitrary,
    transactionId: identifierArbitrary,
    startDate: dateOnlyArbitrary,
    endDate: dateOnlyArbitrary,
    transactionDate: dateOnlyArbitrary,
    dueDate: dateOnlyArbitrary,
    description: textArbitrary,
    categoryName: textArbitrary,
    paymentName: textArbitrary,
    incomeAmount: positiveAmountArbitrary,
    expenseAmount: positiveAmountArbitrary,
    budgetAmount: budgetAmountArbitrary,
    paymentAmount: positiveAmountArbitrary,
    periodType: fc.constantFrom<Period['type']>('monthly', 'biweekly'),
    frequency: fc.constantFrom<RecurringPayment['frequency']>(
      'weekly',
      'biweekly',
      'monthly',
    ),
    paymentStatus: fc.constantFrom<RecurringPayment['status']>(
      'active',
      'inactive',
    ),
    occurrenceStatus: fc.constantFrom<RecurringPaymentOccurrence['status']>(
      'pending',
      'paid',
      'skipped',
    ),
    syncStatus: fc.constantFrom<Period['syncStatus']>(
      'synced',
      'pending',
      'error',
    ),
  })
  .map((value) => {
    const startDate =
      value.startDate <= value.endDate ? value.startDate : value.endDate
    const endDate =
      value.startDate <= value.endDate ? value.endDate : value.startDate
    const base = {
      ownerId: value.ownerId,
      createdAt: instant,
      updatedAt: instant,
      deletedAt: null,
      syncStatus: value.syncStatus,
    } as const

    return {
      period: {
        ...base,
        id: value.periodId,
        type: value.periodType,
        startDate,
        endDate,
      },
      income: {
        ...base,
        id: value.incomeId,
        periodId: value.periodId,
        amount: value.incomeAmount,
        description: value.description,
        date: value.transactionDate,
      },
      expense: {
        ...base,
        id: value.expenseId,
        periodId: value.periodId,
        categoryId: value.categoryId,
        amount: value.expenseAmount,
        description: value.description,
        date: value.transactionDate,
        recurringOccurrenceId:
          value.occurrenceStatus === 'paid' ? value.occurrenceId : null,
      },
      category: {
        ...base,
        id: value.categoryId,
        name: value.categoryName,
        normalizedName: value.categoryName.toLowerCase(),
        color: '#123ABC',
        icon: null,
        isSystem: false,
      },
      budget: {
        ...base,
        id: value.budgetId,
        periodId: value.periodId,
        categoryId: value.categoryId,
        amount: value.budgetAmount,
      },
      payment: {
        ...base,
        id: value.paymentId,
        name: value.paymentName,
        amount: value.paymentAmount,
        frequency: value.frequency,
        dueDate: value.dueDate,
        endDate: null,
        categoryId: value.categoryId,
        status: value.paymentStatus,
      },
      occurrence: {
        ...base,
        id: value.occurrenceId,
        recurringPaymentId: value.paymentId,
        periodId: value.periodId,
        dueDate: value.dueDate,
        status: value.occurrenceStatus,
        transactionId:
          value.occurrenceStatus === 'paid' ? value.transactionId : null,
      },
    }
  })

let databaseSequence = 0
let database: GastoClaroDB | undefined

afterEach(async () => {
  if (!database) return
  const name = database.name
  database.close()
  database = undefined
  await Dexie.delete(name)
})

describe('propiedades de persistencia y validacion', () => {
  it('P1: todas las entidades sincronizables conservan un round-trip equivalente', async () => {
    database = new GastoClaroDB(`persistence-property-${databaseSequence++}`)

    await fc.assert(
      fc.asyncProperty(entitySetArbitrary, async (entities) => {
        await Promise.all([
          database!.periods.clear(),
          database!.incomes.clear(),
          database!.expenses.clear(),
          database!.categories.clear(),
          database!.categoryBudgets.clear(),
          database!.recurringPayments.clear(),
          database!.recurringPaymentOccurrences.clear(),
        ])

        const periods = new DexiePeriodRepository(
          database!,
          entities.period.ownerId,
        )
        const incomes = new DexieIncomeRepository(
          database!,
          entities.period.ownerId,
        )
        const expenses = new DexieExpenseRepository(
          database!,
          entities.period.ownerId,
        )
        const categories = new DexieCategoryRepository(
          database!,
          entities.period.ownerId,
        )
        const budgets = new DexieCategoryBudgetRepository(
          database!,
          entities.period.ownerId,
        )
        const payments = new DexieRecurringPaymentRepository(
          database!,
          entities.period.ownerId,
        )
        const occurrences = new DexieRecurringPaymentOccurrenceRepository(
          database!,
          entities.period.ownerId,
        )

        await periods.create(entities.period)
        await incomes.create(entities.income)
        await expenses.create(entities.expense)
        await categories.create(entities.category)
        await budgets.upsert(entities.budget)
        await payments.create(entities.payment)
        await occurrences.create(entities.occurrence)

        expect(await periods.findById(entities.period.id)).toEqual(
          entities.period,
        )
        expect(await incomes.findById(entities.income.id)).toEqual(
          entities.income,
        )
        expect(await expenses.findById(entities.expense.id)).toEqual(
          entities.expense,
        )
        expect(await categories.findById(entities.category.id)).toEqual(
          entities.category,
        )
        expect(await budgets.findById(entities.budget.id)).toEqual(
          entities.budget,
        )
        expect(await payments.findById(entities.payment.id)).toEqual(
          entities.payment,
        )
        expect(await occurrences.findById(entities.occurrence.id)).toEqual(
          entities.occurrence,
        )
      }),
      { numRuns: RUNS },
    )
  })

  it('P2: valida enteros positivos para movimientos y no negativos para presupuestos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (amount) => {
          expect(positiveCentsSchema.safeParse(amount).success).toBe(amount > 0)
          expect(nonNegativeCentsSchema.safeParse(amount).success).toBe(
            amount >= 0,
          )
        },
      ),
      { numRuns: RUNS },
    )

    const decimalArbitrary = fc
      .tuple(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 99 }),
      )
      .map(([whole, fraction]) => whole + fraction / 100)

    fc.assert(
      fc.property(decimalArbitrary, (amount) => {
        expect(Number.isInteger(amount)).toBe(false)
        expect(positiveCentsSchema.safeParse(amount).success).toBe(false)
        expect(nonNegativeCentsSchema.safeParse(amount).success).toBe(false)
      }),
      { numRuns: RUNS },
    )
  })

  it('P4: rechaza nombres equivalentes despues de trim y lowercase', async () => {
    database = new GastoClaroDB(
      `category-uniqueness-property-${databaseSequence++}`,
    )
    const equivalentNamesArbitrary = fc
      .tuple(
        textArbitrary,
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
      )
      .map(([name, leadingSpaces, trailingSpaces]) => ({
        first: `${' '.repeat(leadingSpaces)}${name.toUpperCase()}${' '.repeat(trailingSpaces)}`,
        second: `${' '.repeat(trailingSpaces)}${name.toLowerCase()}${' '.repeat(leadingSpaces)}`,
      }))

    await fc.assert(
      fc.asyncProperty(equivalentNamesArbitrary, async ({ first, second }) => {
        await database!.categories.clear()
        const categories = new DexieCategoryRepository(database!, 'owner')
        const createCategory = new CreateCategory(
          categories,
          { generate: () => '00000000-0000-4000-8000-000000000001' },
          { now: () => instant },
        )

        const created = await createCategory.execute({
          ownerId: 'owner',
          name: first,
          color: '#123ABC',
        })
        expect(created.normalizedName).toBe(first.trim().toLowerCase())
        await expect(
          createCategory.execute({
            ownerId: 'owner',
            name: second,
            color: '#ABC123',
          }),
        ).rejects.toBeInstanceOf(CategoryDuplicateError)
      }),
      { numRuns: RUNS },
    )
  })
})
