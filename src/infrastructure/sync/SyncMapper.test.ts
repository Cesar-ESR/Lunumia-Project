import { describe, expect, it } from 'vitest'
import type { SyncOperation } from '@domain/entities'
import {
  deserializeRemoteChange,
  serializeOperationPayload,
} from './SyncMapper'

const ownerId = '10000000-0000-4000-8000-000000000001'
const periodId = '20000000-0000-4000-8000-000000000002'
const now = '2026-08-01T10:00:00.000Z'

describe('SyncMapper', () => {
  it('convierte camelCase a snake_case sin alterar DateOnly', () => {
    const operation: SyncOperation = {
      operationId: '30000000-0000-4000-8000-000000000003',
      ownerId,
      entityType: 'period',
      entityId: periodId,
      operationType: 'create',
      payload: JSON.stringify({
        id: periodId,
        ownerId,
        type: 'monthly',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      }),
      createdAt: now,
      status: 'pending',
      errorMessage: null,
      retryCount: 0,
    }
    expect(serializeOperationPayload(operation)).toEqual({
      id: periodId,
      user_id: ownerId,
      type: 'monthly',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
  })

  it('normaliza timestamptz y no espera transaction_id en ocurrencias remotas', () => {
    const change = deserializeRemoteChange('recurringPaymentOccurrence', {
      id: '40000000-0000-4000-8000-000000000004',
      user_id: ownerId,
      recurring_payment_id: '50000000-0000-4000-8000-000000000005',
      period_id: periodId,
      due_date: '2026-08-15',
      status: 'paid',
      amount: 1250,
      created_at: '2026-08-01T10:00:00+00:00',
      updated_at: '2026-08-01T11:00:00+00:00',
      deleted_at: null,
    })
    expect(change.record).toMatchObject({
      dueDate: '2026-08-15',
      transactionId: null,
      amount: 1250,
      createdAt: now,
      updatedAt: '2026-08-01T11:00:00.000Z',
    })
  })

  it('preserva los campos V2 de income y expense en ambos sentidos', () => {
    const incomeId = '80000000-0000-4000-8000-000000000008'
    const operation: SyncOperation = {
      operationId: '30000000-0000-4000-8000-000000000003',
      ownerId,
      entityType: 'income',
      entityId: incomeId,
      operationType: 'create',
      payload: JSON.stringify({
        id: incomeId,
        ownerId,
        periodId,
        amount: 1500,
        description: 'Nómina',
        date: '2026-08-01',
        status: 'received',
        affectsBalance: true,
        balanceEffectiveAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      }),
      createdAt: now,
      status: 'pending',
      errorMessage: null,
      retryCount: 0,
    }
    expect(serializeOperationPayload(operation)).toMatchObject({
      status: 'received',
      affects_balance: true,
      balance_effective_at: now,
    })

    expect(
      deserializeRemoteChange('expense', {
        id: '90000000-0000-4000-8000-000000000009',
        user_id: ownerId,
        period_id: periodId,
        category_id: '70000000-0000-4000-8000-000000000007',
        amount: 450,
        description: 'Café',
        date: '2026-08-01',
        recurring_occurrence_id: null,
        affects_balance: true,
        balance_effective_at: '2026-08-01T10:00:00+00:00',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }).record,
    ).toMatchObject({ affectsBalance: true, balanceEffectiveAt: now })
  })

  it('serializa una cola legacy sin fabricar campos V2', () => {
    const incomeId = '80000000-0000-4000-8000-000000000008'
    const operation: SyncOperation = {
      operationId: '30000000-0000-4000-8000-000000000003',
      ownerId,
      entityType: 'income',
      entityId: incomeId,
      operationType: 'create',
      payload: JSON.stringify({
        id: incomeId,
        ownerId,
        periodId,
        amount: 1500,
        description: 'Legacy',
        date: '2026-08-01',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      }),
      createdAt: now,
      status: 'pending',
      errorMessage: null,
      retryCount: 0,
    }
    const result = serializeOperationPayload(operation)
    expect(result).not.toHaveProperty('status')
    expect(result).not.toHaveProperty('affects_balance')
    expect(result).not.toHaveProperty('balance_effective_at')
  })

  it('mantiene compatibles las colas legacy de expense y occurrence', () => {
    const expenseId = '90000000-0000-4000-8000-000000000009'
    const occurrenceId = '40000000-0000-4000-8000-000000000004'
    const common = {
      operationId: '30000000-0000-4000-8000-000000000003',
      ownerId,
      operationType: 'create' as const,
      createdAt: now,
      status: 'pending' as const,
      errorMessage: null,
      retryCount: 0,
    }
    const expense = serializeOperationPayload({
      ...common,
      entityType: 'expense',
      entityId: expenseId,
      payload: JSON.stringify({
        id: expenseId,
        ownerId,
        periodId,
        categoryId: '70000000-0000-4000-8000-000000000007',
        amount: 450,
        description: 'Legacy expense',
        date: '2026-08-01',
        recurringOccurrenceId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      }),
    })
    const occurrence = serializeOperationPayload({
      ...common,
      entityType: 'recurringPaymentOccurrence',
      entityId: occurrenceId,
      payload: JSON.stringify({
        id: occurrenceId,
        ownerId,
        recurringPaymentId: '60000000-0000-4000-8000-000000000006',
        periodId,
        dueDate: '2026-08-10',
        status: 'pending',
        transactionId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      }),
    })

    expect(expense).not.toHaveProperty('affects_balance')
    expect(expense).not.toHaveProperty('balance_effective_at')
    expect(occurrence).not.toHaveProperty('amount')
    expect(occurrence).not.toHaveProperty('transaction_id')
  })

  it.each([
    ['expected', true, null],
    ['received', false, '2026-08-01T09:00:00+00:00'],
  ] as const)(
    'preserva income inbound %s con su efectividad histórica',
    (status, affectsBalance, balanceEffectiveAt) => {
      const change = deserializeRemoteChange('income', {
        id: '80000000-0000-4000-8000-000000000008',
        user_id: ownerId,
        period_id: periodId,
        amount: 1500,
        description: 'Ingreso V2',
        date: '2026-08-01',
        status,
        affects_balance: affectsBalance,
        balance_effective_at: balanceEffectiveAt,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      expect(change.record).toMatchObject({
        status,
        affectsBalance,
        balanceEffectiveAt:
          balanceEffectiveAt === null ? null : '2026-08-01T09:00:00.000Z',
      })
    },
  )

  it.each([100_000, 0, -25_000])(
    'mapea balanceAnchor signed=%s sin usar capturedAt como cursor',
    (amount) => {
      const anchorId = 'a0000000-0000-4000-8000-00000000000a'
      const change = deserializeRemoteChange('balanceAnchor', {
        id: anchorId,
        user_id: ownerId,
        amount,
        captured_at: '2026-08-01T09:00:00+00:00',
        ledger_cutoff_at: '2026-08-01T08:00:00+00:00',
        created_at: now,
        updated_at: '2026-08-01T11:00:00+00:00',
        deleted_at: null,
      })
      expect(change.record).toMatchObject({
        amount,
        capturedAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T11:00:00.000Z',
      })
    },
  )

  it('rechaza respuestas remotas legacy incompletas', () => {
    expect(() =>
      deserializeRemoteChange('income', {
        id: '80000000-0000-4000-8000-000000000008',
        user_id: ownerId,
        period_id: periodId,
        amount: 1500,
        description: 'Incompleto',
        date: '2026-08-01',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }),
    ).toThrow()
  })

  it('serializa pay_recurring_occurrence sin una columna transaction_id', () => {
    const occurrenceId = '40000000-0000-4000-8000-000000000004'
    const expenseId = '50000000-0000-4000-8000-000000000005'
    const operation: SyncOperation = {
      operationId: '30000000-0000-4000-8000-000000000003',
      ownerId,
      entityType: 'recurringPaymentOccurrence',
      entityId: occurrenceId,
      operationType: 'pay_recurring_occurrence',
      payload: JSON.stringify({
        occurrence: {
          id: occurrenceId,
          ownerId,
          recurringPaymentId: '60000000-0000-4000-8000-000000000006',
          periodId,
          dueDate: '2026-08-10',
          status: 'paid',
          transactionId: expenseId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'pending',
        },
        expense: {
          id: expenseId,
          ownerId,
          periodId,
          categoryId: '70000000-0000-4000-8000-000000000007',
          amount: 1000,
          description: 'Pago',
          date: '2026-08-10',
          recurringOccurrenceId: occurrenceId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'pending',
        },
      }),
      createdAt: now,
      status: 'pending',
      errorMessage: null,
      retryCount: 0,
    }
    const result = serializeOperationPayload(operation)
    expect(JSON.stringify(result)).not.toContain('transaction_id')
    expect(result).toMatchObject({
      occurrence: { id: occurrenceId, status: 'paid' },
      expense: { id: expenseId, recurring_occurrence_id: occurrenceId },
    })
  })
})
