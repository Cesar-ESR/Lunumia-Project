import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { RegisterPage } from './RegisterPage'
import { VerifyEmailPage } from './VerifyEmailPage'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  it('envía un signup sin sesión a la pantalla neutral con el correo normalizado', async () => {
    const signUp = vi.fn(async () => ({
      user: { id: 'user-id', email: 'persona@example.com' },
      session: null,
      requiresEmailVerification: true,
      requiresGuestDecision: false,
    }))
    vi.mocked(useAuth).mockReturnValue({
      isConfigured: true,
      signUp,
    } as never)
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Correo' }),
      ' PERSONA@EXAMPLE.COM ',
    )
    await user.type(screen.getByLabelText('Contraseña'), '12345678')
    await user.type(screen.getByLabelText('Confirmar contraseña'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(
      await screen.findByRole('heading', { name: 'Revisa tu correo' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Si esta dirección puede registrarse, recibirás un correo en persona@example.com para confirmar tu cuenta.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/tu cuenta fue creada/i)).not.toBeInTheDocument()
  })
})
