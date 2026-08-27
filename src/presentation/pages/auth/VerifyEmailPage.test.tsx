import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { VerifyEmailPage } from './VerifyEmailPage'

function renderPage(email?: string) {
  render(
    <MemoryRouter
      initialEntries={[
        email
          ? { pathname: '/verify-email', state: { email } }
          : '/verify-email',
      ]}
    >
      <VerifyEmailPage />
    </MemoryRouter>,
  )
}

describe('VerifyEmailPage', () => {
  it('muestra el correo con lenguaje condicional y acciones semánticas', () => {
    renderPage('persona@example.com')

    expect(
      screen.getByRole('heading', { name: 'Revisa tu correo' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Te enviamos a persona@example.com las instrucciones correspondientes para continuar con tu cuenta.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Puede ser una confirmación de cuenta o una recuperación de acceso.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ya existe una cuenta/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/el correo ya está registrado/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/tu cuenta fue creada/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Iniciar sesión' }),
    ).toHaveAttribute('href', '/login')
    expect(
      screen.getByRole('link', { name: 'Restablecer contraseña' }),
    ).toHaveAttribute('href', '/forgot-password')
  })

  it('mantiene el mensaje neutral cuando no recibe un correo en el estado', () => {
    renderPage()

    expect(
      screen.getByText(
        'Te enviamos las instrucciones correspondientes para continuar con tu cuenta.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Restablecer contraseña' }),
    ).toBeVisible()
  })
})
