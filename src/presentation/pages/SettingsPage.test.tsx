import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationServices } from '../../app/composition-root'
import { App } from '../App'
import { createApplicationServicesMock } from '../test/test-factories'
import { createBackupFile } from '../../../tests/backup-fixtures'

function renderSettings(services: ApplicationServices) {
  window.history.replaceState({}, '', '/settings')
  return render(<App services={services} authServices={null} />)
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.themePreference
})

describe('SettingsPage', () => {
  it('valida, resume y confirma una importación antes de escribir', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    const backup = createBackupFile()
    vi.mocked(services.backup.readFile).mockResolvedValue(
      JSON.stringify(backup),
    )
    vi.mocked(services.backup.prepareImport).mockReturnValue({
      file: backup,
      summary: {
        schemaVersion: backup.schemaVersion,
        exportedAt: backup.exportedAt,
        counts: {
          periods: 1,
          incomes: 1,
          expenses: 1,
          categories: 1,
          categoryBudgets: 1,
          recurringPayments: 1,
          recurringPaymentOccurrences: 1,
          balanceAnchors: 1,
          userSettings: 1,
        },
      },
    })
    vi.mocked(services.backup.importBackup).mockResolvedValue(undefined)

    renderSettings(services)
    const input = await screen.findByLabelText('Seleccionar archivo JSON')
    await user.upload(
      input,
      new File([JSON.stringify(backup)], 'respaldo.json', {
        type: 'application/json',
      }),
    )
    expect(
      await screen.findByRole('dialog', {
        name: 'Reemplazar información local',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Versión del respaldo:')).toBeInTheDocument()
    expect(services.backup.importBackup).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Restaurar y reemplazar' }),
    )
    await waitFor(() =>
      expect(services.backup.importBackup).toHaveBeenCalledWith(backup),
    )
    expect(await screen.findByText(/Respaldo restaurado/)).toBeInTheDocument()
  })

  it('exporta y entrega el JSON al adaptador de descarga', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    const backup = createBackupFile()
    vi.mocked(services.backup.exportBackup).mockResolvedValue(backup)
    vi.mocked(services.backup.serialize).mockReturnValue('{"ok":true}')
    renderSettings(services)
    await user.click(
      await screen.findByRole('button', { name: 'Exportar respaldo' }),
    )
    await waitFor(() =>
      expect(services.backup.download).toHaveBeenCalledWith(
        '{"ok":true}',
        backup.exportedAt,
      ),
    )
  })

  it('muestra preferencias soportadas y mantiene al invitado como estado válido', async () => {
    const { services } = createApplicationServicesMock()
    renderSettings(services)
    expect(
      await screen.findByRole('heading', { name: 'Preferencias compatibles' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Pesos mexicanos (MXN)')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Por ahora, Lunumia utiliza pesos mexicanos (MXN). Próximamente podrás elegir otras monedas.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('La moneda es fija durante UX 2.0.')).toBeNull()
    expect(
      screen.getByRole('group', { name: 'Tema visual' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Sistema/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Claro/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Oscuro/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /moneda/i })).toBeNull()
    expect(screen.queryByRole('switch', { name: /oscuro|tema/i })).toBeNull()
    expect(
      screen.getByText('Guardado en este dispositivo.'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'Iniciar sesión' }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: 'Eliminar mi cuenta' }),
    ).toBeNull()
  })

  it('aplica y persiste inmediatamente la preferencia seleccionada', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    renderSettings(services)
    const dark = await screen.findByRole('radio', { name: /Oscuro/ })

    await user.click(dark)

    expect(dark).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(services.settings.setThemePreference.execute).toHaveBeenCalledWith(
      'dark',
    )
    expect(screen.getByText('Tema aplicado:')).toHaveTextContent(
      'Tema aplicado: Oscuro',
    )
  })

  it('revierte el tema y muestra el error cuando falla la persistencia', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    vi.mocked(services.settings.setThemePreference.execute).mockRejectedValue(
      new Error('No se pudo guardar la preferencia.'),
    )
    renderSettings(services)

    await user.click(await screen.findByRole('radio', { name: /Oscuro/ }))

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Sistema/ })).toBeChecked(),
    )
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(
      screen.getByText('No se pudo guardar la preferencia.'),
    ).toBeInTheDocument()
  })

  it('separa actualización de aplicación y sincronización de datos', async () => {
    const { services } = createApplicationServicesMock()
    renderSettings(services)
    expect(
      await screen.findByRole('heading', { name: 'Sincronización' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Instalación, conexión y actualizaciones',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /actualizaciones de la aplicación se presentan separadas/,
      ),
    ).toBeInTheDocument()
  })
})
