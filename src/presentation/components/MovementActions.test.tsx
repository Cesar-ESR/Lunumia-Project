import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MovementActions } from './MovementActions'
import { ThemeProvider } from '../context/ThemeContext'
import { THEME_STORAGE_KEY } from '../theme/theme'
import { ApplicationServicesProvider } from '../context/ApplicationServicesContext'
import {
  createApplicationServicesMock,
  createIncomeMock,
  createExpenseMock,
  createCategoryMock,
} from '../test/test-factories'

function setup(expense = false) {
  const { services } = createApplicationServicesMock()
  const movement = expense
    ? createExpenseMock()
    : createIncomeMock({ amount: 30000 })
  const onChanged = vi.fn()
  render(
    <ApplicationServicesProvider services={services}>
      <ThemeProvider>
        <MovementActions
          movement={movement}
          categories={[createCategoryMock()]}
          onChanged={onChanged}
        />
      </ThemeProvider>
    </ApplicationServicesProvider>,
  )
  return { services, movement, onChanged, user: userEvent.setup() }
}

it.each(['system', 'light', 'dark'])(
  'usa icon button semántico y estado abierto en %s',
  async (preference) => {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
    const { user } = setup()
    const trigger = screen.getByRole('button', { name: /Acciones de/ })
    expect(trigger).toHaveClass(
      'ln-button',
      'ln-button--icon',
      'ln-movement-actions',
    )
    expect(trigger).not.toHaveClass('ln-row-link')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.documentElement.dataset.themePreference).toBe(preference)
    expect(trigger.querySelector('svg')).toHaveAttribute(
      'stroke',
      'currentColor',
    )
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass(
      'ln-button--primary',
    )
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveClass(
      'ln-button--danger',
    )
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    localStorage.removeItem(THEME_STORAGE_KEY)
  },
)

it.each([false, true])(
  'precarga y guarda sólo campos editables; expense=%s',
  async (expense) => {
    const { services, movement, onChanged, user } = setup(expense)
    await user.click(
      screen.getByRole('button', {
        name: `Acciones de ${movement.description}`,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const amount = screen.getByLabelText('Monto')
    expect(amount).toHaveValue(expense ? '125.00' : '300.00')
    expect(screen.getByLabelText('Descripción')).toHaveValue(
      movement.description,
    )
    expect(screen.getByLabelText('Fecha')).toHaveValue(movement.date)
    expect(amount).toHaveFocus()
    await user.clear(amount)
    await user.type(amount, '350.00')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const execute = expense
      ? services.expenses.updateExpense.execute
      : services.incomes.updateIncome.execute
    expect(execute).toHaveBeenCalledWith(movement.id, {
      ownerId: services.ownerId,
      periodId: movement.periodId,
      amount: 35000,
      description: movement.description,
      date: movement.date,
      ...(expense ? { categoryId: createCategoryMock().id } : {}),
    })
    expect(onChanged).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
)

it('confirma eliminación, Escape cancela y devuelve foco; no elimina al cancelar', async () => {
  const { services, movement, user } = setup()
  const trigger = screen.getByRole('button', {
    name: `Acciones de ${movement.description}`,
  })
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Eliminar' }))
  const dialog = screen.getByRole('dialog', { name: 'Eliminar movimiento' })
  expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(services.incomes.deleteIncome.execute).not.toHaveBeenCalled()
  await user.keyboard('{Enter}')
  await user.click(screen.getByRole('button', { name: 'Eliminar' }))
  await user.click(screen.getByRole('button', { name: 'Eliminar' }))
  expect(services.incomes.deleteIncome.execute).toHaveBeenCalledWith(
    movement.id,
  )
})

it('mantiene formulario y oculta errores internos cuando falla guardar', async () => {
  const { services, onChanged, user } = setup()
  vi.mocked(services.incomes.updateIncome.execute).mockRejectedValue(
    new Error('Dexie internal secret'),
  )
  await user.click(screen.getByRole('button', { name: /Acciones de/ }))
  await user.click(screen.getByRole('button', { name: 'Editar' }))
  await user.clear(screen.getByLabelText('Monto'))
  await user.type(screen.getByLabelText('Monto'), '350')
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(
    await screen.findByText(/Tus cambios siguen en el formulario/),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Monto')).toHaveValue('350')
  expect(screen.queryByText(/Dexie internal/)).not.toBeInTheDocument()
  expect(onChanged).not.toHaveBeenCalled()
})

it('no muestra éxito cuando falla eliminar un gasto y conserva confirmación', async () => {
  const { services, user, onChanged } = setup(true)
  vi.mocked(services.expenses.deleteExpense.execute).mockRejectedValue(
    new Error('internal'),
  )
  await user.click(screen.getByRole('button', { name: /Acciones de/ }))
  await user.click(screen.getByRole('button', { name: 'Eliminar' }))
  await user.click(screen.getByRole('button', { name: 'Eliminar' }))
  expect(
    await screen.findByText(
      'No pudimos eliminar el movimiento. Inténtalo de nuevo.',
    ),
  ).toBeInTheDocument()
  expect(onChanged).not.toHaveBeenCalled()
})

it('rechaza monto inválido y enfoca el error con teclado', async () => {
  const { user, services } = setup()
  await user.tab()
  await user.keyboard('{Enter}')
  await user.click(screen.getByRole('button', { name: 'Editar' }))
  await user.clear(screen.getByLabelText('Monto'))
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(screen.getByLabelText('Monto')).toHaveFocus())
  expect(services.incomes.updateIncome.execute).not.toHaveBeenCalled()
})
