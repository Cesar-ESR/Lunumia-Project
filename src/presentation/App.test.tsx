import { fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { createApplicationServicesMock } from './test/test-factories'

describe('App', () => {
  it('redirige a Inicio y activa la navegación canónica', async () => {
    window.history.replaceState({}, '', '/')
    const { services } = createApplicationServicesMock()
    render(<App services={services} authServices={null} />)
    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Tu panorama financiero' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Ir al contenido principal' }),
    ).toHaveAttribute('href', '#main-content')
    expect(
      screen
        .getAllByRole('link', { name: 'Inicio' })
        .some((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true)
    const destinations = Array.from(document.querySelectorAll('a')).map(
      (link) => link.getAttribute('href'),
    )
    expect(destinations).toContain('/movimientos')
    expect(destinations).toContain('/plan')
    expect(destinations).toContain('/mas')
    expect(window.location.pathname).toBe('/inicio')
  })

  it('muestra una sola acción de instalación en Configuración', async () => {
    window.history.replaceState({}, '', '/settings')
    const { services } = createApplicationServicesMock()
    const event = new Event('beforeinstallprompt')
    Object.defineProperties(event, {
      prompt: { value: vi.fn().mockResolvedValue(undefined) },
      userChoice: {
        value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      },
    })

    render(<App services={services} authServices={null} />)
    await screen.findByRole('heading', { name: 'Configuración' })
    fireEvent(window, event)

    expect(
      await screen.findAllByRole('button', { name: 'Instalar app' }),
    ).toHaveLength(1)
  })
})
