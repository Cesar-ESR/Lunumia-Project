import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type {
  CategoryBudget,
  Expense,
  Income,
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
import {
  computeBudgetRemaining,
  computeCategoryChangePercentage,
  computeCurrentBalance,
  computePendingCommitments,
  computeRealAvailableMoney,
  computeSpendingPace,
  simulatePurchaseImpact,
} from './index'

const cents = fc.integer({ min: 0, max: 1_000_000 })
const base = {
  id: 'id',
  ownerId: 'owner',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced' as const,
}
const income = (amount: number): Income => ({
  ...base,
  periodId: 'period',
  amount,
  description: '',
  date: '2026-01-01',
})
const expense = (amount: number): Expense => ({
  ...base,
  periodId: 'period',
  categoryId: 'category',
  amount,
  description: '',
  date: '2026-01-01',
  recurringOccurrenceId: null,
})
const budget = (amount: number): CategoryBudget => ({
  ...base,
  periodId: 'period',
  categoryId: 'category',
  amount,
})
const payment = (id: string, amount: number): RecurringPayment => ({
  ...base,
  id,
  name: '',
  amount,
  frequency: 'monthly',
  dueDate: '2026-01-01',
  endDate: null,
  categoryId: 'category',
  status: 'active',
})
const occurrence = (
  paymentId: string,
  periodId: string,
  status: RecurringPaymentOccurrence['status'],
): RecurringPaymentOccurrence => ({
  ...base,
  id: `${paymentId}-${periodId}`,
  recurringPaymentId: paymentId,
  periodId,
  dueDate: '2026-01-01',
  status,
  transactionId: null,
})

describe('propiedades de cálculos financieros', () => {
  it('P5 y P8: saldo y disponible real son deterministas', () => {
    fc.assert(
      fc.property(
        fc.array(cents, { maxLength: 30 }),
        fc.array(cents, { maxLength: 30 }),
        cents,
        (incomeValues, expenseValues, pending) => {
          const incomes = incomeValues.map(income)
          const expenses = expenseValues.map(expense)
          const balance = computeCurrentBalance(incomes, expenses)
          expect(balance).toBe(
            incomeValues.reduce((a, b) => a + b, 0) -
              expenseValues.reduce((a, b) => a + b, 0),
          )
          expect(computeCurrentBalance(incomes, expenses)).toBe(balance)
          expect(computeRealAvailableMoney(incomes, expenses, pending)).toBe(
            balance - pending,
          )
        },
      ),
      { numRuns: 100 },
    )
  })
  it('P6: presupuesto restante equivale al presupuesto menos gastos aplicables', () => {
    fc.assert(
      fc.property(
        cents,
        fc.array(cents, { maxLength: 30 }),
        (amount, values) => {
          const categoryBudget = budget(amount)
          const expenses = values.map(expense)
          expect(computeBudgetRemaining(categoryBudget, expenses)).toBe(
            amount - values.reduce((total, value) => total + value, 0),
          )
        },
      ),
      { numRuns: 100 },
    )
  })
  it('P7: solo suma ocurrencias pending no eliminadas', () => {
    fc.assert(
      fc.property(cents, cents, (pendingAmount, paidAmount) => {
        const payments = [
          payment('pending', pendingAmount),
          payment('paid', paidAmount),
        ]
        const occurrences = [
          occurrence('pending', 'period', 'pending'),
          occurrence('paid', 'other', 'paid'),
        ]
        expect(computePendingCommitments(occurrences, payments, 'period')).toBe(
          pendingAmount,
        )
      }),
      { numRuns: 100 },
    )
  })
  it('P9: presupuesto cero es indeterminado y el tiempo siempre está acotado', () => {
    fc.assert(
      fc.property(cents, cents, (budget, spent) => {
        const zero = computeSpendingPace(
          0,
          spent,
          '2026-01-01',
          '2026-01-31',
          '2026-01-15',
        )
        expect(zero.pace).toBe('indeterminate')
        const pace = computeSpendingPace(
          Math.max(1, budget),
          spent,
          '2026-01-01',
          '2026-01-31',
          '2027-01-01',
        )
        expect(pace.timePercentage).toBeGreaterThanOrEqual(0)
        expect(pace.timePercentage).toBeLessThanOrEqual(100)
      }),
      { numRuns: 100 },
    )
  })

  it('P10: la simulación conserva la fórmula y el indicador negativo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        cents,
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (available, purchase, category) => {
          const result = simulatePurchaseImpact(available, purchase, category)
          expect(result.afterPurchaseAvailable).toBe(available - purchase)
          expect(result.isNegative).toBe(result.afterPurchaseAvailable < 0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Feature: gasto-claro-app, Property 20: aplica la fórmula local exacta o null si el anterior es cero', () => {
    fc.assert(
      fc.property(cents, cents, (current, previous) => {
        const result = computeCategoryChangePercentage(current, previous)
        if (previous === 0) {
          expect(result).toBeNull()
          return
        }
        if (result === null)
          throw new Error('El cambio no puede ser null con periodo anterior')
        expect(result).toBe(((current - previous) / previous) * 100)
        expect(Number.isFinite(result)).toBe(true)
        expect(Number.isNaN(result)).toBe(false)
        if (current === previous) expect(result).toBe(0)
        else expect(Math.sign(result)).toBe(Math.sign(current - previous))
      }),
      { numRuns: 200 },
    )
  })
})
