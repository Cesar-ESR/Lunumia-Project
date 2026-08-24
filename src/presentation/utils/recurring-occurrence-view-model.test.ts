import type { LegacyRecurringPaymentOccurrence } from '@domain/entities'
import {
  createApplicationServicesMock,
  createCategoryMock,
  createExpenseMock,
  createOccurrenceMock,
  createRecurringPaymentMock,
  OWNER_ID,
  PERIOD_ID,
} from '../test/test-factories'
import {
  groupOccurrenceViewModels,
  occurrenceToViewModel,
} from './recurring-occurrence-view-model'

describe('recurring occurrence view model', () => {
  it('conserva el snapshot histórico de $500 aunque el plan ya sea de $700', () => {
    const model = occurrenceToViewModel({
      occurrence: createOccurrenceMock({ amount: 50_000, status: 'paid' }),
      payment: createRecurringPaymentMock({ amount: 70_000 }),
      category: createCategoryMock(),
      linkedExpense: createExpenseMock({
        amount: 48_000,
        recurringOccurrenceId: '77777777-7777-4777-8777-777777777777',
      }),
      today: '2026-07-20',
    })

    expect(model.amountCents).toBe(50_000)
    expect(model.actualPaidAmountCents).toBe(48_000)
    expect(model.amountCents).not.toBe(70_000)
  })

  it('no sustituye silenciosamente el monto de una ocurrencia legacy', () => {
    const legacy: LegacyRecurringPaymentOccurrence = {
      id: 'legacy-occurrence',
      ownerId: OWNER_ID,
      recurringPaymentId: '66666666-6666-4666-8666-666666666666',
      periodId: PERIOD_ID,
      dueDate: '2026-07-15',
      status: 'pending',
      transactionId: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
      syncStatus: 'pending',
    }
    const model = occurrenceToViewModel({
      occurrence: legacy,
      payment: createRecurringPaymentMock({ amount: 70_000 }),
      category: createCategoryMock(),
      linkedExpense: undefined,
      today: '2026-07-20',
    })
    expect(model.amountCents).toBeNull()
    expect(model.amountUnavailable).toBe(true)
  })

  it.each([
    ['2026-07-14', 'overdue', 'Vencido'],
    ['2026-07-20', 'due-today', 'Vence hoy'],
    ['2026-07-21', 'due-tomorrow', 'Vence mañana'],
    ['2026-07-22', 'upcoming', 'Próximo'],
  ] as const)('presenta %s como %s', (dueDate, status, label) => {
    const model = occurrenceToViewModel({
      occurrence: createOccurrenceMock({ dueDate }),
      payment: createRecurringPaymentMock(),
      category: createCategoryMock(),
      linkedExpense: undefined,
      today: '2026-07-20',
    })
    expect(model.status).toBe(status)
    expect(model.statusLabel).toBe(label)
  })

  it.each([
    ['paid', 'paid', 'Pagado'],
    ['skipped', 'skipped', 'Omitido'],
  ] as const)(
    'presenta el estado terminal %s',
    (occurrenceStatus, status, label) => {
      const model = occurrenceToViewModel({
        occurrence: createOccurrenceMock({ status: occurrenceStatus }),
        payment: createRecurringPaymentMock(),
        category: createCategoryMock(),
        linkedExpense: undefined,
        today: '2026-07-20',
      })
      expect(model.status).toBe(status)
      expect(model.statusLabel).toBe(label)
    },
  )

  it('separa pendientes, atención inmediata e historial en orden estable', () => {
    const payment = createRecurringPaymentMock()
    const category = createCategoryMock()
    const make = (
      id: string,
      dueDate: string,
      status: 'pending' | 'paid' | 'skipped' = 'pending',
    ) =>
      occurrenceToViewModel({
        occurrence: createOccurrenceMock({ id, dueDate, status }),
        payment,
        category,
        linkedExpense: undefined,
        today: '2026-07-20',
      })
    const groups = groupOccurrenceViewModels([
      make('future', '2026-07-25'),
      make('paid', '2026-07-18', 'paid'),
      make('overdue', '2026-07-10'),
      make('today', '2026-07-20'),
      make('skipped', '2026-07-19', 'skipped'),
    ])
    expect(groups.overdue.map(({ id }) => id)).toEqual(['overdue'])
    expect(groups.immediate.map(({ id }) => id)).toEqual(['today'])
    expect(groups.upcoming.map(({ id }) => id)).toEqual(['future'])
    expect(groups.history.map(({ id }) => id)).toEqual(['skipped', 'paid'])
  })

  it('mantiene disponible el contrato de servicios usado por la presentación', () => {
    const { services } = createApplicationServicesMock()
    expect(services.recurringPayments.markOccurrenceAsPaid.execute).toBeTypeOf(
      'function',
    )
    expect(services.expenses.deleteExpense.execute).toBeTypeOf('function')
  })
})
