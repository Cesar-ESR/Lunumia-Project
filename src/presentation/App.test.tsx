import { fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { createApplicationServicesMock } from './test/test-factories'

describe('App', () => {
  it('redirige al Dashboard dentro del layout principal', async () => {
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
