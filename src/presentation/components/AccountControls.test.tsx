import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AccountControls } from './AccountControls'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

function renderControls({
  signOut = vi.fn(async () => ({
    requiresConfirmation: false,
    unresolvedCount: 0,
  })),
  deleteLocalData = vi.fn(async () => ({
    deleted: true,
    unresolvedCount: 0,
  })),
} = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'owner-id', email: 'persona@example.com' },
    status: 'authenticated',
    signOut,
    deleteLocalData,
  } as never)
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AccountControls />} />
        <Route path="/login" element={<span>Pantalla de login</span>} />
      </Routes>
    </MemoryRouter>,
  )
  return { signOut, deleteLocalData }
}

function renderGuestControls() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    status: 'guest',
  } as never)
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AccountControls />} />
        <Route path="/login" element={<span>Pantalla de login</span>} />
        <Route path="/register" element={<span>Pantalla de registro</span>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AccountControls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mantiene las acciones de invitado como enlaces secundarios canónicos', () => {
    renderGuestControls()

    const guestContext = screen.getByText('Modo invitado').closest('div')
    const login = screen.getByRole('link', { name: 'Iniciar sesión' })
    const register = screen.getByRole('link', { name: 'Crear cuenta' })

    expect(guestContext).toHaveClass('ln-account-controls--guest')
    expect(login).toHaveAttribute('href', '/login')
    expect(register).toHaveAttribute('href', '/register')
    expect(login).toHaveClass('ln-button', 'ln-button--secondary')
    expect(register).toHaveClass('ln-button', 'ln-button--secondary')
  })

  it('cerrar sesión de todos modos conserva datos locales no resueltos', async () => {
    const user = userEvent.setup()
    const signOut = vi
      .fn()
      .mockResolvedValueOnce({
        requiresConfirmation: true,
        unresolvedCount: 2,
      })
      .mockResolvedValueOnce({
        requiresConfirmation: false,
        unresolvedCount: 2,
      })
    const { deleteLocalData } = renderControls({ signOut })

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(
      screen.getByText(/los datos y la cola permanecerán guardados/i),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: 'Cerrar sesión de todos modos',
      }),
    )

    expect(signOut).toHaveBeenNthCalledWith(1)
    expect(signOut).toHaveBeenNthCalledWith(2, true)
    expect(deleteLocalData).not.toHaveBeenCalled()
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
  })

  it('separa y confirma la eliminación local destructiva', async () => {
    const user = userEvent.setup()
    const { signOut, deleteLocalData } = renderControls()

    await user.click(
      screen.getByRole('button', { name: 'Eliminar datos locales' }),
    )
    expect(
      screen.getByText(/elimina de este dispositivo todos los datos locales/i),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: 'Eliminar datos de este dispositivo',
      }),
    )

    expect(deleteLocalData).toHaveBeenCalledOnce()
    expect(signOut).not.toHaveBeenCalled()
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
  })

  it('muestra el bloqueo si quedan cambios no sincronizados', async () => {
    const user = userEvent.setup()
    const deleteLocalData = vi.fn(async () => ({
      deleted: false,
      unresolvedCount: 3,
    }))
    renderControls({ deleteLocalData })

    await user.click(
      screen.getByRole('button', { name: 'Eliminar datos locales' }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Eliminar datos de este dispositivo',
      }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pueden eliminar los datos locales porque hay 3 cambios sin sincronizar.',
    )
  })
})
