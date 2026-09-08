import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from '../context/AuthContext'
import { GuestDataDecisionDialog } from './GuestDataDecisionDialog'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

const summary = {
  periods: 1,
  incomes: 2,
  expenses: 3,
  categories: 1,
  budgets: 0,
  recurringPayments: 0,
  occurrences: 0,
  balanceAnchors: 0,
  hasData: true,
}

describe('GuestDataDecisionDialog', () => {
  it.each([
    ['Usar estos datos en mi cuenta', 'migrate-local'],
    ['Usar los datos de mi cuenta', 'keep-account'],
    ['Eliminar estos datos del dispositivo', 'discard-local'],
    ['Cancelar', 'cancel'],
  ] as const)('preserva la decisión %s', async (label, decision) => {
    const user = userEvent.setup()
    const resolveGuestData = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      pendingGuestData: { summary },
      resolveGuestData,
    } as never)

    render(<GuestDataDecisionDialog />)
    expect(
      screen.getByRole('dialog', {
        name: 'Datos guardados en este dispositivo',
      }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: label }))
    expect(resolveGuestData).toHaveBeenCalledWith(decision)
    expect(resolveGuestData).toHaveBeenCalledTimes(1)
  })

  it.each([7, 17])('explica las decisiones con %s registros', (count) => {
    vi.mocked(useAuth).mockReturnValue({
      pendingGuestData: { summary: { ...summary, expenses: count - 4 } },
      resolveGuestData: vi.fn(),
    } as never)
    render(<GuestDataDecisionDialog />)
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      `Encontramos ${count} registros creados como invitado. Elige qué quieres hacer con ellos.`,
    )
    const migrate = screen.getByRole('button', {
      name: 'Usar estos datos en mi cuenta',
    })
    const keep = screen.getByRole('button', {
      name: 'Usar los datos de mi cuenta',
    })
    const discard = screen.getByRole('button', {
      name: 'Eliminar estos datos del dispositivo',
    })
    expect(migrate).toHaveAccessibleDescription(
      `Los ${count} registros de este dispositivo se añadirán a tu cuenta.`,
    )
    expect(keep).toHaveAccessibleDescription(
      'Ignoraremos estos datos locales y mantendremos los datos que ya tiene tu cuenta.',
    )
    expect(discard).toHaveAccessibleDescription(
      `Se eliminarán permanentemente los ${count} registros locales.`,
    )
    expect(discard).toHaveClass('ln-button--danger')
    expect(migrate).not.toHaveClass('ln-button--danger')
    expect(keep).not.toHaveClass('ln-button--danger')
    expect(
      screen.getByText(/se prepararán para sincronizarse/),
    ).toBeInTheDocument()
  })

  it('permite cancelar con Escape', async () => {
    const resolveGuestData = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      pendingGuestData: { summary },
      resolveGuestData,
    } as never)
    render(<GuestDataDecisionDialog />)
    await userEvent.setup().keyboard('{Escape}')
    expect(resolveGuestData).toHaveBeenCalledExactlyOnceWith('cancel')
  })
})
