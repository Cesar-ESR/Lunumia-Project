import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApplicationServicesProvider } from '../context/ApplicationServicesContext'
import { PeriodProvider } from '../context/PeriodContext'
import { createApplicationServicesMock } from '../test/test-factories'
import { createBackupFile } from '../../../tests/backup-fixtures'
import { SettingsPage } from './SettingsPage'

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
        schemaVersion: 1,
        exportedAt: backup.exportedAt,
        counts: {
          periods: 1,
          incomes: 1,
          expenses: 1,
          categories: 1,
          categoryBudgets: 1,
          recurringPayments: 1,
          recurringPaymentOccurrences: 1,
          userSettings: 1,
        },
      },
    })
    vi.mocked(services.backup.importBackup).mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ApplicationServicesProvider services={services}>
          <PeriodProvider>
            <SettingsPage />
          </PeriodProvider>
        </ApplicationServicesProvider>
      </MemoryRouter>,
    )
    const input = screen.getByLabelText('Seleccionar archivo JSON')
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
    expect(screen.getByText('Versión del esquema:')).toBeInTheDocument()
    expect(services.backup.importBackup).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Importar y reemplazar' }),
    )
    await waitFor(() =>
      expect(services.backup.importBackup).toHaveBeenCalledWith(backup),
    )
    expect(await screen.findByText(/Respaldo importado/)).toBeInTheDocument()
  })

  it('exporta y entrega el JSON al adaptador de descarga', async () => {
    const user = userEvent.setup()
    const { services } = createApplicationServicesMock()
    const backup = createBackupFile()
    vi.mocked(services.backup.exportBackup).mockResolvedValue(backup)
    vi.mocked(services.backup.serialize).mockReturnValue('{"ok":true}')
    render(
      <MemoryRouter>
        <ApplicationServicesProvider services={services}>
          <PeriodProvider>
            <SettingsPage />
          </PeriodProvider>
        </ApplicationServicesProvider>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Exportar respaldo' }))
    await waitFor(() =>
      expect(services.backup.download).toHaveBeenCalledWith(
        '{"ok":true}',
        backup.exportedAt,
      ),
    )
  })
})
