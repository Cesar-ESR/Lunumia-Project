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
  OWNER_ID,
  createApplicationServicesMock,
  createFinancialSnapshotMock,
} from '../test/test-factories'

function renderRecurringPayments(
  services: ReturnType<typeof createApplicationServicesMock>['services'],
) {
  window.history.replaceState({}, '', '/recurring')
  return render(<App services={services} />)
}

describe('RecurringPaymentsPage', () => {
  it('usa committedCents del snapshot sin reconstruirlo desde pagos', async () => {
    const { services } = createApplicationServicesMock({
      financialSnapshot: createFinancialSnapshotMock({
        committedCents: 12_345,
      }),
    })
    renderRecurringPayments(services)

    const pending = await screen.findByText('Pendientes')
    expect(
      await within(pending.parentElement!).findByLabelText('$123.45'),
    ).toBeInTheDocument()
  })

  it('asocia errores en español con los controles inválidos', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    renderRecurringPayments(services)
    await screen.findByRole('option', { name: 'Comida' })

    await user.click(screen.getByRole('button', { name: 'Crear pago' }))

    expect(screen.getByLabelText('Nombre')).toHaveAttribute(
      'aria-describedby',
      'recurring-name-error',
    )
    expect(screen.getByLabelText('Monto')).toHaveAttribute(
      'aria-describedby',
      'recurring-amount-error',
    )
    expect(screen.getByLabelText('Fecha inicial')).toHaveAttribute(
      'aria-describedby',
      'recurring-date-error',
    )
    expect(screen.getByLabelText('Categoría')).toHaveAttribute(
      'aria-describedby',
      'recurring-category-error',
    )
    expect(
      screen.queryByText(/Invalid UUID|Too small/i),
    ).not.toBeInTheDocument()
  })

  it('crea un pago con fecha final opcional', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    renderRecurringPayments(services)
    await screen.findByRole('option', { name: 'Comida' })

    await user.type(screen.getByLabelText('Nombre'), 'Suscripción')
    await user.type(screen.getByLabelText('Monto'), '250.00')
    fireEvent.change(screen.getByLabelText('Fecha inicial'), {
      target: { value: '2026-07-05' },
    })
    fireEvent.change(screen.getByLabelText('Fecha final (opcional)'), {
      target: { value: '2026-09-05' },
    })
    await user.selectOptions(
      screen.getByLabelText('Categoría'),
      '22222222-2222-4222-8222-222222222222',
    )
    await user.click(screen.getByRole('button', { name: 'Crear pago' }))

    await waitFor(() =>
      expect(mocks.createRecurringPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 25_000,
          dueDate: '2026-07-05',
          endDate: '2026-09-05',
        }),
      ),
    )
  })

  it('registra el pago con una fecha elegida dentro del periodo activo', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    renderRecurringPayments(services)

    await user.click(
      await screen.findByRole('button', { name: 'Marcar como pagado' }),
    )
    const paidDate = screen.getByLabelText('Fecha de pago')
    expect(paidDate).toHaveAttribute('min', '2026-07-01')
    expect(paidDate).toHaveAttribute('max', '2026-07-31')
    fireEvent.change(paidDate, { target: { value: '2026-07-20' } })
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() =>
      expect(mocks.markOccurrenceAsPaid).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        occurrenceId: '77777777-7777-4777-8777-777777777777',
        paidDate: '2026-07-20',
      }),
    )
  })
})
