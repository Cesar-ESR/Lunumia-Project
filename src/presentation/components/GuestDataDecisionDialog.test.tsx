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
    ['Migrar datos de este dispositivo', 'migrate-local'],
    ['Conservar datos de la cuenta', 'keep-account'],
    ['Descartar datos locales', 'discard-local'],
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
  })
})
