import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenSourceNoticesDialog } from './OpenSourceNoticesDialog'

const mockLicenses = [
  {
    name: '@capacitor/core',
    version: '8.4.2',
    license: 'MIT',
    author: 'Ionic Team',
    repository: 'https://github.com/ionic-team/capacitor',
    description: 'Capacitor core',
    licenseText: 'MIT License for Capacitor Core',
  },
  {
    name: 'dexie',
    version: '4.4.4',
    license: 'Apache-2.0',
    author: 'David Fahlander',
    repository: 'https://github.com/dexie/Dexie.js',
    description: 'Minimalistic IndexedDB wrapper',
    licenseText: 'Apache License Version 2.0 for Dexie',
  },
]

describe('OpenSourceNoticesDialog', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockLicenses,
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no realiza petición cuando open es falso', () => {
    render(<OpenSourceNoticesDialog open={false} onClose={() => {}} />)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('carga y muestra la lista de licencias cuando se abre', async () => {
    render(<OpenSourceNoticesDialog open={true} onClose={() => {}} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Avisos de código abierto')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('@capacitor/core')).toBeInTheDocument()
      expect(screen.getByText('dexie')).toBeInTheDocument()
    })

    expect(screen.getByText('2 paquetes')).toBeInTheDocument()
  })

  it('permite filtrar paquetes mediante el buscador', async () => {
    const user = userEvent.setup()
    render(<OpenSourceNoticesDialog open={true} onClose={() => {}} />)

    await screen.findByText('@capacitor/core')

    const searchInput = screen.getByPlaceholderText(
      'Buscar por nombre, licencia o autor...',
    )
    await user.type(searchInput, 'dexie')

    expect(screen.getByText('dexie')).toBeInTheDocument()
    expect(screen.queryByText('@capacitor/core')).not.toBeInTheDocument()
    expect(screen.getByText('1 paquete')).toBeInTheDocument()
  })

  it('permite expandir y ver el texto legal completo', async () => {
    const user = userEvent.setup()
    render(<OpenSourceNoticesDialog open={true} onClose={() => {}} />)

    await screen.findByText('@capacitor/core')

    expect(
      screen.queryByText('MIT License for Capacitor Core'),
    ).not.toBeInTheDocument()

    const expandButton = screen.getByRole('button', {
      name: /Ver licencia de @capacitor\/core/i,
    })
    await user.click(expandButton)

    expect(
      screen.getByText('MIT License for Capacitor Core'),
    ).toBeInTheDocument()
  })

  it('maneja el estado de error limpiamente si falla la descarga', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    render(<OpenSourceNoticesDialog open={true} onClose={() => {}} />)

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudieron obtener las licencias/i),
      ).toBeInTheDocument()
    })
  })
})
