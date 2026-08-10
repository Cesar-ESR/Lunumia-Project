import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ExpenseForm, type ExpenseFormValue } from './ExpenseForm'
import {
  CATEGORY_ID,
  createCategoryMock,
  createPeriodMock,
} from '../test/test-factories'

function renderForm(
  onSubmit = vi
    .fn<(value: ExpenseFormValue) => Promise<void>>()
    .mockResolvedValue(undefined),
) {
  render(
    <ExpenseForm
      ownerId="guest:test-owner"
      period={createPeriodMock()}
      categories={[createCategoryMock()]}
      onSubmit={onSubmit}
    />,
  )
  return { onSubmit }
}

async function completeValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Monto'), '123.45')
  await user.type(screen.getByLabelText('Descripción'), 'Despensa')
  await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
  await user.clear(screen.getByLabelText('Fecha'))
  await user.type(screen.getByLabelText('Fecha'), '2026-07-10')
}

describe('ExpenseForm', () => {
  it('valida campos vacíos y exige categoría', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    expect(
      screen.getByText('Escribe un monto positivo con máximo dos decimales.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Este campo es obligatorio.')).toBeInTheDocument()
    expect(
      screen.getByText('Selecciona una opción válida.'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each(['-10', '12.345'])(
    'rechaza el monto inválido %s',
    async (invalidAmount) => {
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText('Monto'), invalidAmount)
      await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
      expect(
        screen.getByText('Escribe un monto positivo con máximo dos decimales.'),
      ).toBeInTheDocument()
    },
  )

  it('convierte un monto válido a centavos, bloquea durante guardado y limpia al terminar', async () => {
    const user = userEvent.setup()
    let resolveSave: (() => void) | undefined
    const onSubmit = vi
      .fn<(value: ExpenseFormValue) => Promise<void>>()
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve
          }),
      )
    renderForm(onSubmit)
    await completeValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12345, categoryId: CATEGORY_ID }),
    )
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    resolveSave?.()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Agregar gasto' }),
      ).toBeEnabled(),
    )
    expect(screen.getByLabelText('Monto')).toHaveValue('')
    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(screen.getByLabelText('Categoría')).toHaveValue('')
  })

  it('conserva los datos si el guardado falla', async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn<(value: ExpenseFormValue) => Promise<void>>()
      .mockRejectedValue(new Error('No se pudo guardar'))
    renderForm(onSubmit)
    await completeValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto')).toHaveValue('123.45')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Despensa')
  })
})
