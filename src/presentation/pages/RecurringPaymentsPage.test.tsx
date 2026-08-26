import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import {
  CATEGORY_ID,
  OWNER_ID,
  PERIOD_ID,
  createApplicationServicesMock,
  createExpenseMock,
  createFinancialSnapshotMock,
  createOccurrenceMock,
  createPeriodMock,
  createRecurringPaymentMock,
} from '../test/test-factories'

const APP_READY_TIMEOUT_MS = 3_000

type MockResult = ReturnType<typeof createApplicationServicesMock>

function renderPath(path: string, result = createApplicationServicesMock()) {
  window.history.replaceState({}, '', path)
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, view }
}

function configureOverview(
  result: MockResult,
  {
    plan = createRecurringPaymentMock(),
    occurrence = createOccurrenceMock(),
    expense,
  }: {
    plan?: ReturnType<typeof createRecurringPaymentMock>
    occurrence?: ReturnType<typeof createOccurrenceMock>
    expense?: ReturnType<typeof createExpenseMock>
  } = {},
) {
  vi.mocked(
    result.services.recurringPayments.getOverview.execute,
  ).mockResolvedValue({ payments: [plan], occurrences: [occurrence] })
  vi.mocked(
    result.services.expenses.listExpensesByPeriod.execute,
  ).mockResolvedValue(expense ? [expense] : [])
  return { plan, occurrence, expense }
}

describe('Compromisos UX 2.0', () => {
  it('redirige /recurring al destino canónico y mantiene Plan activo', async () => {
    renderPath('/recurring')
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Compromisos' },
        { timeout: APP_READY_TIMEOUT_MS },
      ),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(window.location.pathname).toBe('/plan/compromisos'),
    )
    expect(
      screen
        .getAllByRole('link', { name: 'Plan' })
        .some((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true)
  })

  it('muestra $500 en la ocurrencia histórica aunque el plan editado muestre $700', async () => {
    const result = createApplicationServicesMock()
    configureOverview(result, {
      plan: createRecurringPaymentMock({ amount: 70_000 }),
      occurrence: createOccurrenceMock({ amount: 50_000, status: 'paid' }),
    })
    renderPath('/plan/compromisos', result)

    await screen.findByRole('heading', { name: 'Historial' })
    const history = screen
      .getByRole('heading', { name: 'Historial' })
      .closest('section')!
    expect(within(history).getByLabelText('$500.00')).toBeInTheDocument()
    const plans = screen
      .getByRole('heading', { name: 'Qué se repite' })
      .closest('section')!
    expect(within(plans).getByLabelText('$700.00')).toBeInTheDocument()
  })

  it('combina el detalle del periodo con la alerta vencida owner-wide', async () => {
    const result = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        overdueCommittedCents: 90_000,
      }),
    })
    configureOverview(result, {
      occurrence: createOccurrenceMock({ amount: 50_000 }),
    })
    renderPath('/plan/compromisos', result)

    expect(
      await screen.findByRole('heading', {
        name: 'Resumen general de compromisos vencidos',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('$900.00')).toBeInTheDocument()
  })

  it('genera ocurrencias sólo cuando el periodo activo contiene hoy', async () => {
    const current = createPeriodMock({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    const result = createApplicationServicesMock({ activePeriod: current })
    const currentView = renderPath('/plan/compromisos', result)
    await screen.findByRole('heading', { name: 'Compromisos' })
    await waitFor(() =>
      expect(
        result.services.recurringPayments.generateOccurrencesForPeriod.execute,
      ).toHaveBeenCalledWith(OWNER_ID, PERIOD_ID),
    )

    currentView.view.unmount()
    const past = createApplicationServicesMock()
    renderPath('/plan/compromisos', past)
    await screen.findByRole('heading', { name: 'Compromisos' })
    expect(
      past.services.recurringPayments.generateOccurrencesForPeriod.execute,
    ).not.toHaveBeenCalled()
  })

  it('crea un plan con el escritor existente y fecha final opcional', async () => {
    const user = userEvent.setup()
    const result = renderPath('/plan/compromisos/planes/nuevo')
    await screen.findByRole('heading', { name: 'Crear plan recurrente' })

    await user.type(screen.getByLabelText(/Nombre del compromiso/), 'Renta')
    await user.type(
      screen.getByLabelText('Monto planeado en pesos mexicanos'),
      '700.00',
    )
    fireEvent.change(screen.getByLabelText(/Primera fecha/), {
      target: { value: '2026-09-01' },
    })
    await user.selectOptions(
      screen.getByLabelText(/Categoría del gasto/),
      CATEGORY_ID,
    )
    await user.click(screen.getByRole('button', { name: 'Crear plan' }))

    await waitFor(() =>
      expect(
        result.services.recurringPayments.createRecurringPayment.execute,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Renta',
          amount: 70_000,
          dueDate: '2026-09-01',
          endDate: null,
        }),
      ),
    )
    expect(window.location.pathname).toBe('/plan/compromisos')
  })

  it('actualiza el plan y explica que las ocurrencias generadas no cambian', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const plan = createRecurringPaymentMock({ amount: 50_000 })
    configureOverview(result, { plan })
    renderPath(`/plan/compromisos/planes/${plan.id}`, result)

    expect(
      await screen.findByText(
        /Las ocurrencias ya generadas conservan su monto original/,
      ),
    ).toBeInTheDocument()
    const amount = screen.getByLabelText('Monto planeado en pesos mexicanos')
    await user.clear(amount)
    await user.type(amount, '700.00')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(
        result.services.recurringPayments.updateRecurringPayment.execute,
      ).toHaveBeenCalledWith(
        plan.id,
        expect.objectContaining({ amount: 70_000, status: 'active' }),
      ),
    )
    expect(window.location.pathname).toBe('/plan/compromisos')
  })

  it('separa pausar un plan de eliminarlo y explica qué permanece', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const { plan } = configureOverview(result)
    renderPath('/plan/compromisos', result)

    await user.click(await screen.findByRole('button', { name: 'Pausar plan' }))
    await waitFor(() =>
      expect(
        result.services.recurringPayments.toggleRecurringPaymentStatus.execute,
      ).toHaveBeenCalledWith(plan.id),
    )
    await user.click(screen.getByRole('button', { name: 'Eliminar plan' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Eliminar plan recurrente',
    })
    expect(dialog).toHaveTextContent('No se generarán nuevas ocurrencias')
    expect(dialog).toHaveTextContent('historial existente permanecerá')
    await user.click(
      within(dialog).getByRole('button', { name: 'Eliminar plan' }),
    )
    await waitFor(() =>
      expect(
        result.services.recurringPayments.deleteRecurringPayment.execute,
      ).toHaveBeenCalledWith(plan.id),
    )
  })

  it('registra pago con fecha y monto real mediante la operación atómica', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const { occurrence } = configureOverview(result)
    const linkedExpense = createExpenseMock({
      description: 'Internet',
      amount: 47_500,
      date: '2026-07-20',
      recurringOccurrenceId: occurrence.id,
    })
    let paymentCompleted = false
    vi.mocked(
      result.services.recurringPayments.markOccurrenceAsPaid.execute,
    ).mockImplementation(async () => {
      paymentCompleted = true
      return {
        occurrence: { ...occurrence, status: 'paid' },
        expense: linkedExpense,
      }
    })
    vi.mocked(
      result.services.expenses.listExpensesByPeriod.execute,
    ).mockImplementation(async () => (paymentCompleted ? [linkedExpense] : []))
    renderPath(`/plan/compromisos/${occurrence.id}`, result)

    await user.click(
      await screen.findByRole('button', { name: 'Registrar pago' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Registrar este pago' })
    const amount = within(dialog).getByLabelText(
      'Monto pagado en pesos mexicanos',
    )
    await user.clear(amount)
    await user.type(amount, '475.00')
    fireEvent.change(within(dialog).getByLabelText(/Fecha de pago/), {
      target: { value: '2026-07-20' },
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Registrar pago' }),
    )

    await waitFor(() =>
      expect(
        result.services.recurringPayments.markOccurrenceAsPaid.execute,
      ).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        occurrenceId: occurrence.id,
        paidDate: '2026-07-20',
        actualAmountCents: 47_500,
      }),
    )
    expect(
      screen.getByText('Pago registrado. Se creó el gasto vinculado.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Pagado' }),
      ),
    )

    await user.click(screen.getByRole('link', { name: 'Ver en Movimientos' }))
    expect(
      await screen.findByRole('heading', { name: 'Movimientos' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/Desde compromiso/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Abrir Internet, Gasto' }),
    ).toHaveAttribute('href', `/plan/compromisos/${occurrence.id}`)
  })

  it('omite sólo la ocurrencia y deja el plan intacto', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const { occurrence } = configureOverview(result)
    renderPath(`/plan/compromisos/${occurrence.id}`, result)

    await user.click(
      await screen.findByRole('button', { name: 'Omitir esta ocurrencia' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Omitir esta ocurrencia',
    })
    expect(dialog).toHaveTextContent('El plan continuará')
    await user.click(
      within(dialog).getByRole('button', { name: 'Omitir ocurrencia' }),
    )

    await waitFor(() =>
      expect(
        result.services.recurringPayments.markOccurrenceAsSkipped.execute,
      ).toHaveBeenCalledWith(PERIOD_ID, occurrence.id),
    )
    expect(
      result.services.recurringPayments.deleteRecurringPayment.execute,
    ).not.toHaveBeenCalled()
    expect(
      screen.getByText('Ocurrencia omitida. El plan continuará.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Omitir/ })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Omitido' }),
      ),
    )
  })

  it('deshace un pago borrando el gasto vinculado y vuelve a pendiente tras éxito', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const occurrence = createOccurrenceMock({ status: 'paid' })
    const expense = createExpenseMock({
      id: 'linked-expense',
      amount: 48_000,
      date: '2026-07-16',
      recurringOccurrenceId: occurrence.id,
    })
    configureOverview(result, { occurrence, expense })
    renderPath(`/plan/compromisos/${occurrence.id}`, result)

    await user.click(
      await screen.findByRole('button', { name: 'Deshacer pago' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Deshacer pago' })
    expect(dialog).toHaveTextContent('Se eliminará el gasto vinculado')
    await user.click(
      within(dialog).getByRole('button', { name: 'Deshacer pago' }),
    )

    await waitFor(() =>
      expect(
        result.services.expenses.deleteExpense.execute,
      ).toHaveBeenCalledWith(expense.id),
    )
    expect(
      screen.getByText('Pago deshecho. El compromiso volvió a pendiente.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Registrar pago' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ver en Movimientos')).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Vencido' }),
      ),
    )
  })

  it('no ofrece deshacer si falta el gasto autoritativo y conserva pagado si el borrado falla', async () => {
    const resultWithoutExpense = createApplicationServicesMock()
    const paid = createOccurrenceMock({ status: 'paid' })
    configureOverview(resultWithoutExpense, { occurrence: paid })
    const first = renderPath(
      `/plan/compromisos/${paid.id}`,
      resultWithoutExpense,
    )
    await screen.findByRole('heading', { name: 'Pagado' })
    expect(screen.queryByRole('button', { name: 'Deshacer pago' })).toBeNull()
    first.view.unmount()

    const user = userEvent.setup()
    const failed = createApplicationServicesMock()
    const expense = createExpenseMock({
      recurringOccurrenceId: paid.id,
    })
    configureOverview(failed, { occurrence: paid, expense })
    vi.mocked(failed.services.expenses.deleteExpense.execute).mockRejectedValue(
      new Error('No se pudo eliminar el gasto.'),
    )
    renderPath(`/plan/compromisos/${paid.id}`, failed)
    await user.click(
      await screen.findByRole('button', { name: 'Deshacer pago' }),
    )
    await user.click(
      within(screen.getByRole('dialog', { name: 'Deshacer pago' })).getByRole(
        'button',
        { name: 'Deshacer pago' },
      ),
    )
    expect(
      await screen.findByText('No se pudo eliminar el gasto.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pagado' })).toBeInTheDocument()
  })

  it('explica el efecto lateral antes de eliminar un gasto recurrente directamente', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const expense = createExpenseMock({
      description: 'Internet',
      recurringOccurrenceId: 'occurrence-linked',
    })
    vi.mocked(
      result.services.expenses.listExpensesByPeriod.execute,
    ).mockResolvedValue([expense])
    renderPath('/expenses', result)
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog', { name: 'Eliminar gasto' })
    expect(dialog).toHaveTextContent('También se deshará el pago vinculado')
    expect(
      within(dialog).getByRole('button', {
        name: 'Eliminar gasto y deshacer pago',
      }),
    ).toBeInTheDocument()
  })
})
