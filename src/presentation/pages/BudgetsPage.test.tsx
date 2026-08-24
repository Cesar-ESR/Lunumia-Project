import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import {
  CATEGORY_ID,
  PERIOD_ID,
  createApplicationServicesMock,
  createCategoryBudgetSummaryMock,
  createCategoryMock,
  createDashboardBudgetSummaryMock,
} from '../test/test-factories'

function renderBudgets(
  result = createApplicationServicesMock(),
  path = '/plan/presupuestos',
) {
  window.history.replaceState({}, '', path)
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, view }
}

async function findBudgetRow(name = 'Comida') {
  return screen.findByRole('article', { name })
}

describe('BudgetsPage U7B', () => {
  it('consume y muestra valores por categoría exactamente como los entrega Application', async () => {
    const result = createApplicationServicesMock({
      budgetSummary: createDashboardBudgetSummaryMock({
        totalBudget: 100_000,
        budgetRemaining: -15_000,
      }),
      categoryBudgetSummaries: [
        createCategoryBudgetSummaryMock({
          budgetCents: 100_000,
          spentCents: 70_000,
          remainingCents: 12_345,
          status: 'within',
        }),
      ],
    })
    renderBudgets(result)

    const row = await findBudgetRow()
    expect(within(row).getByText('Presupuesto configurado')).toBeInTheDocument()
    expect(within(row).getAllByLabelText('$1,000.00').length).toBeGreaterThan(0)
    expect(within(row).getAllByLabelText('$700.00').length).toBeGreaterThan(0)
    expect(within(row).getAllByLabelText('$123.45').length).toBeGreaterThan(0)
    expect(within(row).getByRole('progressbar')).toHaveValue(70)
    expect(within(row).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '70',
    )
    expect(within(row).getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '100',
    )
    expect(
      result.services.budgets.getCategoryBudgetSummaries.execute,
    ).toHaveBeenCalledWith({
      ownerId: result.services.ownerId,
      periodId: PERIOD_ID,
    })
    expect(
      result.services.budgets.listBudgetsByPeriod.execute,
    ).not.toHaveBeenCalled()
    expect(
      result.services.expenses.listExpensesByPeriod.execute,
    ).not.toHaveBeenCalled()

    const summary = await screen.findByRole('region', {
      name: 'Resumen autoritativo de presupuestos',
    })
    expect(within(summary).getByLabelText('$1,000.00')).toBeInTheDocument()
    expect(
      within(summary).getByLabelText('-$150.00, valor negativo'),
    ).toBeInTheDocument()
    expect(summary).toHaveTextContent('El restante total es negativo')
    expect(
      result.services.dashboard.getBudgetSummary.execute,
    ).toHaveBeenCalled()
  })

  it('muestra gasto conocido y restante no aplicable sin presupuesto', async () => {
    renderBudgets(
      createApplicationServicesMock({
        categoryBudgetSummaries: [
          createCategoryBudgetSummaryMock({
            budgetCents: null,
            spentCents: 4_321,
            remainingCents: null,
            status: 'not_configured',
          }),
        ],
      }),
    )

    const row = await findBudgetRow()
    expect(within(row).getAllByText('Sin presupuesto').length).toBeGreaterThan(
      0,
    )
    expect(within(row).getAllByLabelText('$43.21').length).toBeGreaterThan(0)
    expect(within(row).getByText('No aplica')).toBeInTheDocument()
    expect(within(row).queryByRole('progressbar')).toBeNull()
    expect(
      screen.getByRole('heading', {
        name: 'Aún no has definido presupuestos para este periodo',
      }),
    ).toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'Definir presupuesto' }),
    ).toBeInTheDocument()
    expect(
      within(row).queryByRole('button', { name: 'Quitar presupuesto' }),
    ).toBeNull()
  })

  it('cubre gasto exacto, categoría sin presupuesto ni gasto y montos grandes', async () => {
    const result = createApplicationServicesMock({
      categoryBudgetSummaries: [
        createCategoryBudgetSummaryMock({
          categoryId: 'exact',
          budgetCents: 1_000,
          spentCents: 1_000,
          remainingCents: 0,
          status: 'within',
        }),
        createCategoryBudgetSummaryMock({
          categoryId: 'none-zero',
          budgetCents: null,
          spentCents: 0,
          remainingCents: null,
          status: 'not_configured',
        }),
        createCategoryBudgetSummaryMock({
          categoryId: 'large',
          budgetCents: 987_654_321,
          spentCents: 123,
          remainingCents: 987_654_198,
          status: 'within',
        }),
      ],
    })
    vi.mocked(
      result.services.categories.listCategories.execute,
    ).mockResolvedValue([
      createCategoryMock({ id: 'exact', name: 'Exacto' }),
      createCategoryMock({ id: 'none-zero', name: 'Sin gasto' }),
      createCategoryMock({ id: 'large', name: 'Monto grande' }),
    ])
    renderBudgets(result)

    const exactRow = await findBudgetRow('Exacto')
    expect(within(exactRow).getByRole('progressbar')).toHaveValue(100)
    expect(exactRow).toHaveTextContent('Te quedan $0.00')

    const noSpendRow = await findBudgetRow('Sin gasto')
    expect(noSpendRow).toHaveTextContent('Has gastado $0.00')
    expect(within(noSpendRow).queryByRole('progressbar')).toBeNull()

    const largeRow = await findBudgetRow('Monto grande')
    expect(
      within(largeRow).getAllByLabelText('$9,876,543.21').length,
    ).toBeGreaterThan(0)
  })

  it('mantiene cero configurado con cero gastado y omite progreso porcentual', async () => {
    renderBudgets(
      createApplicationServicesMock({
        categoryBudgetSummaries: [
          createCategoryBudgetSummaryMock({
            budgetCents: 0,
            spentCents: 0,
            remainingCents: 0,
            status: 'within',
          }),
        ],
      }),
    )

    const row = await findBudgetRow()
    expect(within(row).queryByText('Sin presupuesto')).toBeNull()
    expect(within(row).queryByRole('progressbar')).toBeNull()
    expect(row).toHaveTextContent('Presupuesto configurado en')
    expect(
      screen.getByLabelText('Presupuesto para Comida en pesos mexicanos'),
    ).toHaveValue('0.00')
  })

  it('maneja presupuesto cero excedido sin NaN ni división por cero', async () => {
    renderBudgets(
      createApplicationServicesMock({
        categoryBudgetSummaries: [
          createCategoryBudgetSummaryMock({
            budgetCents: 0,
            spentCents: 5_000,
            remainingCents: -5_000,
            status: 'over',
          }),
        ],
      }),
    )

    const row = await findBudgetRow()
    expect(within(row).getByText('Presupuesto excedido')).toBeInTheDocument()
    expect(within(row).queryByRole('progressbar')).toBeNull()
    expect(
      within(row).getAllByLabelText('-$50.00, valor negativo').length,
    ).toBeGreaterThan(0)
    expect(row).not.toHaveTextContent(/NaN|Infinity/)
  })

  it('anuncia progreso completo sin ocultar un exceso autoritativo', async () => {
    renderBudgets(
      createApplicationServicesMock({
        categoryBudgetSummaries: [
          createCategoryBudgetSummaryMock({
            budgetCents: 100_000,
            spentCents: 115_000,
            remainingCents: -15_000,
            status: 'over',
          }),
        ],
      }),
    )

    const row = await findBudgetRow()
    expect(within(row).getByText('Presupuesto excedido')).toBeInTheDocument()
    expect(within(row).getByRole('progressbar')).toHaveValue(100)
    expect(within(row).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('Presupuesto excedido'),
    )
    expect(
      within(row).getAllByLabelText('-$150.00, valor negativo').length,
    ).toBeGreaterThan(0)
    expect(row).toHaveTextContent('Presupuesto excedido. Restante:')
  })

  it('crea un presupuesto y recarga la autoridad sin cálculo optimista', async () => {
    const user = userEvent.setup()
    const notConfigured = createCategoryBudgetSummaryMock({
      budgetCents: null,
      spentCents: 12_500,
      remainingCents: null,
      status: 'not_configured',
    })
    const configured = createCategoryBudgetSummaryMock({
      budgetCents: 25_000,
      spentCents: 12_500,
      remainingCents: 12_500,
      status: 'within',
    })
    const setup = createApplicationServicesMock({
      categoryBudgetSummaries: [notConfigured],
    })
    vi.mocked(setup.services.budgets.getCategoryBudgetSummaries.execute)
      .mockResolvedValueOnce([notConfigured])
      .mockResolvedValue([configured])
    const result = renderBudgets(setup)
    const field = await screen.findByLabelText(
      'Presupuesto para Comida en pesos mexicanos',
    )
    await user.type(field, '250.00')
    await user.click(
      screen.getByRole('button', { name: 'Definir presupuesto' }),
    )

    await waitFor(() =>
      expect(
        result.services.budgets.upsertCategoryBudget.execute,
      ).toHaveBeenCalledWith({
        ownerId: result.services.ownerId,
        periodId: PERIOD_ID,
        categoryId: CATEGORY_ID,
        amount: 25_000,
      }),
    )
    await screen.findByRole('button', { name: 'Ajustar presupuesto' })
    expect(
      result.services.budgets.getCategoryBudgetSummaries.execute,
    ).toHaveBeenCalledTimes(2)
    expect(await findBudgetRow()).toHaveFocus()
    expect(screen.getByText('Presupuesto guardado.')).toBeInTheDocument()
  })

  it('ajusta y reemplaza la fila sólo con el summary recargado', async () => {
    const user = userEvent.setup()
    const initial = createCategoryBudgetSummaryMock({ budgetCents: 60_000 })
    const refreshed = createCategoryBudgetSummaryMock({
      budgetCents: 75_000,
      spentCents: 20_000,
      remainingCents: 55_000,
    })
    const setup = createApplicationServicesMock({
      categoryBudgetSummaries: [initial],
    })
    vi.mocked(setup.services.budgets.getCategoryBudgetSummaries.execute)
      .mockResolvedValueOnce([initial])
      .mockResolvedValue([refreshed])
    renderBudgets(setup)
    const field = await screen.findByLabelText(
      'Presupuesto para Comida en pesos mexicanos',
    )
    await user.clear(field)
    await user.type(field, '800.00')
    await user.click(
      screen.getByRole('button', { name: 'Ajustar presupuesto' }),
    )

    await waitFor(() =>
      expect(
        screen.getByLabelText('Presupuesto para Comida en pesos mexicanos'),
      ).toHaveValue('750.00'),
    )
    expect(
      setup.services.budgets.getCategoryBudgetSummaries.execute,
    ).toHaveBeenCalledTimes(2)
  })

  it('quita sólo el límite y recarga la categoría como not_configured', async () => {
    const user = userEvent.setup()
    const configured = createCategoryBudgetSummaryMock()
    const notConfigured = createCategoryBudgetSummaryMock({
      budgetCents: null,
      remainingCents: null,
      status: 'not_configured',
    })
    const setup = createApplicationServicesMock({
      categoryBudgetSummaries: [configured],
    })
    vi.mocked(setup.services.budgets.getCategoryBudgetSummaries.execute)
      .mockResolvedValueOnce([configured])
      .mockResolvedValue([notConfigured])
    const result = renderBudgets(setup)
    await user.click(
      await screen.findByRole('button', { name: 'Quitar presupuesto' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Quitar presupuesto' })
    expect(dialog).toHaveTextContent(
      'Sólo se quitará el límite planificado. La categoría y sus movimientos permanecerán.',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Quitar presupuesto' }),
    )
    await waitFor(() =>
      expect(
        result.services.budgets.deleteCategoryBudget.execute,
      ).toHaveBeenCalledWith(PERIOD_ID, CATEGORY_ID),
    )
    await screen.findByRole('button', { name: 'Definir presupuesto' })
    expect(
      result.services.budgets.getCategoryBudgetSummaries.execute,
    ).toHaveBeenCalledTimes(2)
    expect(await findBudgetRow()).toHaveFocus()
  })

  it('conserva summary e input cuando falla el writer', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    vi.mocked(
      result.services.budgets.upsertCategoryBudget.execute,
    ).mockRejectedValueOnce(new Error('No se pudo guardar el presupuesto.'))
    renderBudgets(result)
    const field = await screen.findByLabelText(
      'Presupuesto para Comida en pesos mexicanos',
    )
    await user.clear(field)
    await user.type(field, '999.00')
    await user.click(
      screen.getByRole('button', { name: 'Ajustar presupuesto' }),
    )

    expect(
      await screen.findAllByText('No se pudo guardar el presupuesto.'),
    ).toHaveLength(2)
    expect(field).toHaveValue('999.00')
    expect(
      result.services.budgets.getCategoryBudgetSummaries.execute,
    ).toHaveBeenCalledTimes(1)
    expect(
      within(await findBudgetRow()).getAllByLabelText('$600.00').length,
    ).toBeGreaterThan(0)
  })

  it('ordena over, within y not_configured usando el status suministrado', async () => {
    const result = createApplicationServicesMock({
      categoryBudgetSummaries: [
        createCategoryBudgetSummaryMock({
          categoryId: 'none',
          budgetCents: null,
          remainingCents: null,
          status: 'not_configured',
        }),
        createCategoryBudgetSummaryMock({ categoryId: 'within' }),
        createCategoryBudgetSummaryMock({
          categoryId: 'over',
          remainingCents: -1,
          status: 'over',
        }),
      ],
    })
    vi.mocked(
      result.services.categories.listCategories.execute,
    ).mockResolvedValue([
      createCategoryMock({ id: 'none', name: 'A Sin presupuesto' }),
      createCategoryMock({ id: 'within', name: 'B Dentro' }),
      createCategoryMock({ id: 'over', name: 'Z Excedido' }),
    ])
    renderBudgets(result)

    await screen.findByRole('article', { name: 'Z Excedido' })
    expect(
      screen
        .getAllByRole('article')
        .map((row) => row.getAttribute('aria-labelledby')),
    ).toEqual([
      'budget-heading-over',
      'budget-heading-within',
      'budget-heading-none',
    ])
  })

  it('muestra empty state cuando no existen categorías', async () => {
    const result = createApplicationServicesMock({
      categoryBudgetSummaries: [],
    })
    vi.mocked(
      result.services.categories.listCategories.execute,
    ).mockResolvedValue([])
    renderBudgets(result)
    expect(
      await screen.findByRole('heading', { name: 'No hay categorías' }),
    ).toBeInTheDocument()
  })

  it('redirige /budgets al destino canónico sin perder el CRUD', async () => {
    renderBudgets(createApplicationServicesMock(), '/budgets')
    expect(
      await screen.findByRole('heading', { name: 'Presupuestos' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(window.location.pathname).toBe('/plan/presupuestos'),
    )
    expect(
      await screen.findByRole('button', { name: 'Ajustar presupuesto' }),
    ).toBeInTheDocument()
  })
})
