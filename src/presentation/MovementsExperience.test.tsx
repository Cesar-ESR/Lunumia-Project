import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import {
  createApplicationServicesMock,
  createExpenseMock,
  createIncomeMock,
} from './test/test-factories'

const APP_READY_TIMEOUT_MS = 3_000

function renderPath(path: string) {
  window.history.replaceState({}, '', path)
  const result = createApplicationServicesMock()
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, view }
}

describe('Movimientos e ingresos UX 2.0', () => {
  it('expone las acciones de gasto, recibo e ingreso para un periodo activo', async () => {
    renderPath('/movimientos')

    const registerExpense = await screen.findByRole(
        'link',
        { name: 'Registrar gasto' },
        { timeout: APP_READY_TIMEOUT_MS },
      )
    const scanReceipt = screen.getByRole('link', { name: 'Escanear recibo' })
    const registerIncome = screen.getByRole('link', {
      name: 'Registrar ingreso',
    })
    expect(registerExpense).toHaveAttribute('href', '/expenses')
    expect(registerExpense).toHaveClass('ln-button--primary')
    expect(scanReceipt).toHaveAttribute('href', '/expenses/receipt')
    expect(scanReceipt).toHaveClass('ln-button--secondary')
    expect(registerIncome).toHaveAttribute(
      'href',
      '/movimientos/ingresos/nuevo',
    )
    expect(registerIncome).toHaveClass('ln-button--primary')
  })

  it('navega desde Movimientos al formulario de gasto existente', async () => {
    const user = userEvent.setup()
    renderPath('/movimientos')

    await user.click(
      await screen.findByRole(
        'link',
        { name: 'Registrar gasto' },
        { timeout: APP_READY_TIMEOUT_MS },
      ),
    )

    await waitFor(() => expect(window.location.pathname).toBe('/expenses'))
    expect(
      await screen.findByRole('heading', { name: 'Nuevo gasto' }),
    ).toBeInTheDocument()
  })

  it('navega desde Movimientos al flujo de recibos existente', async () => {
    const user = userEvent.setup()
    renderPath('/movimientos')

    await user.click(
      await screen.findByRole(
        'link',
        { name: 'Escanear recibo' },
        { timeout: APP_READY_TIMEOUT_MS },
      ),
    )

    await waitFor(() =>
      expect(window.location.pathname).toBe('/expenses/receipt'),
    )
    expect(
      await screen.findByRole('heading', { name: 'Escanear recibo' }),
    ).toBeInTheDocument()
  })

  it('unifica movimientos, conserva estados y sincroniza filtros con la URL', async () => {
    const user = userEvent.setup()
    const { services } = renderPath('/movimientos')
    vi.mocked(services.incomes.listIncomesByPeriod.execute).mockResolvedValue([
      createIncomeMock({ id: 'received', description: 'Sueldo' }),
      createIncomeMock({
        id: 'expected',
        description: 'Reembolso pendiente',
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
      createIncomeMock({
        id: 'cancelled',
        description: 'Venta cancelada',
        status: 'cancelled',
        affectsBalance: false,
        balanceEffectiveAt: null,
      }),
      createIncomeMock({
        id: 'historical',
        description: 'Ingreso ya considerado',
        affectsBalance: false,
      }),
    ])
    vi.mocked(services.expenses.listExpensesByPeriod.execute).mockResolvedValue(
      [
        createExpenseMock({ description: 'Supermercado' }),
        createExpenseMock({
          id: 'historical-expense',
          description: 'Renta anterior',
          affectsBalance: false,
        }),
      ],
    )

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Reembolso pendiente' },
        { timeout: APP_READY_TIMEOUT_MS },
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Expectativa cancelada')).toBeInTheDocument()
    expect(screen.getAllByText(/Ya estaba reflejado en tu saldo/)).toHaveLength(
      2,
    )
    expect(screen.getAllByText(/-\$125\.00/)).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Esperados' }))
    await waitFor(() =>
      expect(window.location.search).toBe('?tipo=ingresos&estado=esperados'),
    )
    expect(screen.getByText('Reembolso pendiente')).toBeInTheDocument()
    expect(screen.queryByText('Sueldo')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Canceladas' }))
    expect(screen.getByText('Venta cancelada')).toBeInTheDocument()
    expect(screen.queryByText('Reembolso pendiente')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Todos' }))
    await user.selectOptions(
      screen.getByLabelText('Categoría'),
      '22222222-2222-4222-8222-222222222222',
    )
    expect(screen.getByText('Supermercado')).toBeInTheDocument()
    expect(screen.queryByText('Sueldo')).toBeNull()
  })

  it('crea un ingreso recibido histórico con centavos enteros y semántica humana', async () => {
    const user = userEvent.setup()
    const { services } = renderPath('/movimientos/ingresos/nuevo')
    expect(
      await screen.findByRole('radio', { name: 'Ya lo recibí' }),
    ).toBeChecked()
    expect(screen.queryByText('affectsBalance')).toBeNull()

    await user.type(screen.getByLabelText('Monto en pesos mexicanos'), '123.45')
    await user.type(screen.getByLabelText(/Descripción u origen/), 'Venta')
    await user.clear(screen.getByLabelText(/Fecha en que lo recibiste/))
    await user.type(
      screen.getByLabelText(/Fecha en que lo recibiste/),
      '2026-07-10',
    )
    await user.click(screen.getByLabelText(/Sí, sólo agregarlo al historial/))
    await user.click(
      screen.getByRole('button', { name: 'Guardar ingreso recibido' }),
    )

    await waitFor(() =>
      expect(services.incomes.createIncome.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 12345,
          description: 'Venta',
          date: '2026-07-10',
          affectsBalance: false,
        }),
      ),
    )
    expect(
      await screen.findByRole('heading', { name: 'Movimientos' }),
    ).toBeInTheDocument()
    expect(window.location.search).toBe('?tipo=ingresos&estado=recibidos')
    expect(screen.getByText('Ingreso recibido guardado.')).toBeInTheDocument()
  })

  it('crea una expectativa con el escritor dedicado y explica que no está disponible', async () => {
    const user = userEvent.setup()
    const { services } = renderPath('/movimientos/ingresos/nuevo?modo=esperado')
    expect(
      await screen.findByRole('radio', { name: 'Espero recibirlo' }),
    ).toBeChecked()
    expect(
      screen.getByText('Todavía no forma parte de tu saldo.'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Monto en pesos mexicanos'), '80.00')
    await user.type(screen.getByLabelText(/Descripción u origen/), 'Reembolso')
    await user.clear(screen.getByLabelText(/Fecha esperada/))
    await user.type(screen.getByLabelText(/Fecha esperada/), '2026-07-20')
    await user.click(
      screen.getByRole('button', { name: 'Guardar ingreso esperado' }),
    )
    expect(screen.queryByText('Revisa los campos marcados.')).toBeNull()

    await waitFor(() =>
      expect(
        services.incomes.createExpectedIncome.execute,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 8000, date: '2026-07-20' }),
      ),
    )
    expect(services.incomes.createIncome.execute).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?tipo=ingresos&estado=esperados')
  })

  it('marca una expectativa como recibida sólo después de confirmar', async () => {
    const user = userEvent.setup()
    const { services } = renderPath('/movimientos/ingresos/income-expected')
    const expected = createIncomeMock({
      id: 'income-expected',
      description: 'Bono',
      status: 'expected',
      affectsBalance: false,
      balanceEffectiveAt: null,
    })
    vi.mocked(services.incomes.listIncomesByPeriod.execute).mockResolvedValue([
      expected,
    ])
    vi.mocked(services.incomes.markIncomeAsReceived.execute).mockResolvedValue({
      ...expected,
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: '2026-07-15T12:00:00.000Z',
    })

    await user.click(
      await screen.findByRole('button', { name: 'Marcar como recibido' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Marcar ingreso como recibido',
    })
    expect(services.incomes.markIncomeAsReceived.execute).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole('button', { name: 'Marcar como recibido' }),
    )
    await waitFor(() =>
      expect(
        services.incomes.markIncomeAsReceived.execute,
      ).toHaveBeenCalledWith('income-expected'),
    )
    expect(
      screen.getByText('Ingreso marcado como recibido.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ya no espero recibirlo' }),
    ).toBeNull()
  })

  it('cancela sin eliminar y conserva la expectativa como estado terminal visible', async () => {
    const user = userEvent.setup()
    const { services } = renderPath('/movimientos/ingresos/income-cancel')
    const expected = createIncomeMock({
      id: 'income-cancel',
      description: 'Venta prevista',
      status: 'expected',
      affectsBalance: false,
      balanceEffectiveAt: null,
    })
    vi.mocked(services.incomes.listIncomesByPeriod.execute).mockResolvedValue([
      expected,
    ])
    vi.mocked(services.incomes.cancelExpectedIncome.execute).mockResolvedValue({
      ...expected,
      status: 'cancelled',
    })

    await user.click(
      await screen.findByRole('button', { name: 'Ya no espero recibirlo' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Cancelar expectativa' })
    expect(dialog).toHaveTextContent('No se eliminará')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Conservar como cancelada',
      }),
    )
    await waitFor(() =>
      expect(
        services.incomes.cancelExpectedIncome.execute,
      ).toHaveBeenCalledWith('income-cancel'),
    )
    expect(services.incomes.deleteIncome.execute).not.toHaveBeenCalled()
    expect(screen.getByText('Expectativa cancelada')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Marcar como recibido' }),
    ).toBeNull()
  })

  it('redirige /incomes al filtro de ingresos sin perder intención', async () => {
    renderPath('/incomes')
    expect(
      await screen.findByRole('heading', { name: 'Movimientos' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/movimientos'))
    expect(window.location.search).toBe('?tipo=ingresos')
  })
})
