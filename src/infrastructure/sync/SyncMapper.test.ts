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
      created_at: '2026-08-01T10:00:00+00:00',
      updated_at: '2026-08-01T11:00:00+00:00',
      deleted_at: null,
    })
    expect(change.record).toMatchObject({
      dueDate: '2026-08-15',
      transactionId: null,
      createdAt: now,
      updatedAt: '2026-08-01T11:00:00.000Z',
    })
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
