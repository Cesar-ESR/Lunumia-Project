import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallAppButton } from './InstallAppButton'
import { OfflineIndicator } from './OfflineIndicator'
import { UpdatePrompt } from './UpdatePrompt'

const sw = vi.hoisted(() => ({
  offlineReady: false,
  needRefresh: false,
  setOfflineReady: vi.fn(),
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}))
const connectivity = vi.hoisted(() => ({ isOnline: true }))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [sw.offlineReady, sw.setOfflineReady],
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}))

vi.mock('../context/SyncContext', () => ({
  useSync: () => ({ isOnline: connectivity.isOnline }),
}))

describe('componentes PWA', () => {
  beforeEach(() => {
    sw.offlineReady = false
    sw.needRefresh = false
    connectivity.isOnline = true
    vi.clearAllMocks()
  })

  it('muestra y oculta el indicador con el estado del provider', () => {
    const view = render(<OfflineIndicator />)
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
    connectivity.isOnline = false
    view.rerender(<OfflineIndicator />)
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
    connectivity.isOnline = true
    view.rerender(<OfflineIndicator />)
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
  })

  it('ofrece instalación solo después de beforeinstallprompt', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = new Event('beforeinstallprompt')
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    })
    render(<InstallAppButton />)
    expect(
      screen.queryByRole('button', { name: 'Instalar app' }),
    ).not.toBeInTheDocument()
    fireEvent(window, event)
    await user.click(
      await screen.findByRole('button', { name: 'Instalar app' }),
    )
    expect(prompt).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Instalar app' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('descarta el evento de instalación después de una decisión negativa', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = new Event('beforeinstallprompt')
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: {
        value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      },
    })
    render(<InstallAppButton />)
    fireEvent(window, event)
    await user.click(
      await screen.findByRole('button', { name: 'Instalar app' }),
    )
    expect(prompt).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Instalar app' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('permite aceptar una actualización del service worker', async () => {
    const user = userEvent.setup()
    sw.needRefresh = true
    render(<UpdatePrompt />)
    expect(screen.getByText('Nueva versión disponible.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actualizar ahora' }))
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('muestra la marca Lunumia cuando la PWA queda disponible sin conexión', () => {
    sw.offlineReady = true
    render(<UpdatePrompt />)
    expect(
      screen.getByText('Lunumia está listo para usarse sin conexión.'),
    ).toBeInTheDocument()
  })

  it('permite posponer una actualización disponible', async () => {
    const user = userEvent.setup()
    sw.needRefresh = true
    render(<UpdatePrompt />)
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false)
    expect(sw.setOfflineReady).toHaveBeenCalledWith(false)
    expect(sw.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('informa un fallo al actualizar sin dejar una promesa rechazada', async () => {
    const user = userEvent.setup()
    sw.needRefresh = true
    sw.updateServiceWorker.mockRejectedValueOnce(new Error('network error'))
    render(<UpdatePrompt />)
    await user.click(screen.getByRole('button', { name: 'Actualizar ahora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo actualizar ahora.',
    )
  })
})
