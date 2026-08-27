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
        'Si esta dirección puede registrarse, recibirás un correo en persona@example.com para confirmar tu cuenta.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/enviamos instrucciones/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/tu cuenta fue creada/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/te enviamos un correo/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'iniciar sesión' }),
    ).toHaveAttribute('href', '/login')
    expect(
      screen.getByRole('link', { name: 'restablecer tu contraseña' }),
    ).toHaveAttribute('href', '/forgot-password')
  })

  it('mantiene el mensaje neutral cuando no recibe un correo en el estado', () => {
    renderPage()

    expect(
      screen.getByText(
        'Si la dirección puede registrarse, recibirás un correo para continuar.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'iniciar sesión' })).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'restablecer tu contraseña' }),
    ).toBeVisible()
  })
})
