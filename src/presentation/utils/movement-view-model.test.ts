import type { LegacyIncome } from '@domain/entities'
import {
  createCategoryMock,
  createExpenseMock,
  createIncomeMock,
  OWNER_ID,
  PERIOD_ID,
} from '../test/test-factories'
import {
  expenseToMovementViewModel,
  incomeToMovementViewModel,
  sortMovements,
} from './movement-view-model'

describe('movement view model', () => {
  it.each([
    ['received', 'income-received', 'Recibido'],
    ['expected', 'income-expected', 'Esperado'],
    ['cancelled', 'income-cancelled', 'Expectativa cancelada'],
  ] as const)(
    'mapea ingreso %s sin cambiar su monto',
    (status, kind, label) => {
      const movement = incomeToMovementViewModel(
        createIncomeMock({
          status,
          affectsBalance: status === 'received',
          balanceEffectiveAt:
            status === 'received' ? '2026-07-01T00:00:00.000Z' : null,
        }),
      )
      expect(movement).toMatchObject({
        kind,
        statusLabel: label,
        amountCents: 200000,
      })
    },
  )

  it('traduce un recibido sin impacto como histórico con contexto humano', () => {
    const movement = incomeToMovementViewModel(
      createIncomeMock({ affectsBalance: false }),
    )
    expect(movement.historical).toBe(true)
    expect(movement.historicalContext).toContain('Agregado al historial')
    expect(movement.historicalContext).not.toContain('affectsBalance')
  })

  it('interpreta ingresos legacy como recibidos según la migración v4', () => {
    const legacy: LegacyIncome = {
      id: 'legacy-income',
      ownerId: OWNER_ID,
      periodId: PERIOD_ID,
      amount: 5000,
      description: 'Ingreso anterior',
      date: '2026-07-02',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
      deletedAt: null,
      syncStatus: 'pending',
    }
    expect(incomeToMovementViewModel(legacy)).toMatchObject({
      kind: 'income-received',
      historical: false,
      statusLabel: 'Recibido',
    })
  })

  it('mapea gasto con signo de salida, categoría e indicador recurrente', () => {
    const movement = expenseToMovementViewModel(
      createExpenseMock({ recurringOccurrenceId: 'occurrence-1' }),
      createCategoryMock({ name: 'Hogar' }),
    )
    expect(movement).toMatchObject({
      kind: 'expense',
      amountCents: -12500,
      categoryOrOrigin: 'Hogar',
      recurringLinked: true,
      recurringContext: 'Desde compromiso',
      navigationTarget: '/plan/compromisos/occurrence-1',
    })
  })

  it('mapea un gasto histórico sin volver a descontarlo visualmente', () => {
    const movement = expenseToMovementViewModel(
      createExpenseMock({ affectsBalance: false }),
      createCategoryMock(),
    )
    expect(movement.historical).toBe(true)
    expect(movement.historicalContext).toContain(
      'Ya estaba reflejado en tu saldo',
    )
  })

  it('ordena por fecha, createdAt e id de forma descendente y estable', () => {
    const first = incomeToMovementViewModel(
      createIncomeMock({
        id: 'a',
        date: '2026-07-10',
        createdAt: '2026-07-10T10:00:00.000Z',
      }),
    )
    const second = incomeToMovementViewModel(
      createIncomeMock({
        id: 'b',
        date: '2026-07-10',
        createdAt: '2026-07-10T11:00:00.000Z',
      }),
    )
    const newest = incomeToMovementViewModel(
      createIncomeMock({ id: 'c', date: '2026-07-11' }),
    )
    expect(sortMovements([first, newest, second]).map(({ id }) => id)).toEqual([
      'c',
      'b',
      'a',
    ])
  })
})
