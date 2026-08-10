import { useRef, useState, type ChangeEvent } from 'react'
import type { PreparedBackup } from '@application/services/BackupService'
import { MAX_BACKUP_FILE_SIZE_BYTES } from '@shared/constants'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DeleteAccountSection } from '../components/DeleteAccountSection'
import { InstallAppButton } from '../components/InstallAppButton'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'

const countLabels = {
  periods: 'Periodos',
  incomes: 'Ingresos',
  expenses: 'Gastos',
  categories: 'Categorías',
  categoryBudgets: 'Presupuestos',
  recurringPayments: 'Pagos recurrentes',
  recurringPaymentOccurrences: 'Ocurrencias',
  userSettings: 'Configuración',
} as const

function errorMessage(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : 'Ocurrió un error inesperado.'
}

function validateSelectedFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.json'))
    throw new Error('Selecciona un archivo con extensión .json.')
  if (file.size === 0) throw new Error('El archivo seleccionado está vacío.')
  if (file.size > MAX_BACKUP_FILE_SIZE_BYTES)
    throw new Error('El respaldo supera el límite de 5 MB.')
  if (file.type && !['application/json', 'text/json'].includes(file.type)) {
    throw new Error('El archivo seleccionado no tiene un tipo JSON válido.')
  }
}

export function SettingsPage() {
  const services = useApplicationServices()
  const { refreshPeriods } = usePeriod()
  const inputRef = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<PreparedBackup | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const exportBackup = async () => {
    setIsExporting(true)
    setNotice(null)
    try {
      const backup = await services.backup.exportBackup()
      services.backup.download(
        services.backup.serialize(backup),
        backup.exportedAt,
      )
      setNotice({
        tone: 'success',
        message: 'Respaldo exportado correctamente.',
      })
    } catch (reason) {
      setNotice({ tone: 'error', message: errorMessage(reason) })
    } finally {
      setIsExporting(false)
    }
  }

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPrepared(null)
    setNotice(null)
    try {
      validateSelectedFile(file)
      const serialized = await services.backup.readFile(file)
      setPrepared(services.backup.prepareImport(serialized))
    } catch (reason) {
      setNotice({ tone: 'error', message: errorMessage(reason) })
      event.target.value = ''
    }
  }

  const cancelImport = () => {
    setPrepared(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const confirmImport = async () => {
    if (!prepared) return
    setIsImporting(true)
    setNotice(null)
    try {
      await services.backup.importBackup(prepared.file)
      await refreshPeriods()
      setNotice({
        tone: 'success',
        message:
          'Respaldo importado. La información local ya está actualizada.',
      })
      cancelImport()
    } catch (reason) {
      setNotice({ tone: 'error', message: errorMessage(reason) })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Privacidad local"
        title="Configuración"
        description="Crea una copia manual de tus datos o restaura un respaldo de Lunumia."
        actions={<InstallAppButton />}
      />
      {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}
      <div className="settings-grid">
        <section className="panel settings-card" aria-labelledby="export-title">
          <div>
            <p className="eyebrow">Guardar copia</p>
            <h2 id="export-title">Exportar respaldo</h2>
          </div>
          <p>
            Descarga periodos, movimientos, categorías, presupuestos, pagos
            recurrentes y configuración en un JSON versionado.
          </p>
          <button
            className="button"
            type="button"
            disabled={isExporting}
            onClick={() => void exportBackup()}
          >
            {isExporting ? 'Preparando…' : 'Exportar respaldo'}
          </button>
        </section>
        <section className="panel settings-card" aria-labelledby="import-title">
          <div>
            <p className="eyebrow">Restaurar copia</p>
            <h2 id="import-title">Importar respaldo</h2>
          </div>
          <p>
            El archivo se valida por completo antes de solicitar confirmación.
            La importación reemplaza únicamente los datos del usuario local
            actual.
          </p>
          <label className="button secondary file-button">
            Seleccionar archivo JSON
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void selectFile(event)}
            />
          </label>
        </section>
        <DeleteAccountSection />
      </div>
      <aside className="security-note">
        <strong>Tu respaldo contiene información financiera privada.</strong>
        <span>
          Guárdalo en un lugar seguro. Lunumia lo procesa en este dispositivo y
          no lo envía a un servidor.
        </span>
      </aside>
      <ConfirmDialog
        open={prepared !== null}
        title="Reemplazar información local"
        description="Esta acción sustituirá los datos actuales de este usuario por el contenido validado del respaldo."
        confirmLabel="Importar y reemplazar"
        isPending={isImporting}
        onConfirm={() => void confirmImport()}
        onCancel={cancelImport}
      >
        {prepared ? (
          <div className="backup-summary">
            <p>
              <strong>Exportado:</strong>{' '}
              {new Date(prepared.summary.exportedAt).toLocaleString('es-MX')}
            </p>
            <p>
              <strong>Versión del esquema:</strong>{' '}
              {prepared.summary.schemaVersion}
            </p>
            <dl>
              {Object.entries(prepared.summary.counts).map(([key, count]) => (
                <div key={key}>
                  <dt>{countLabels[key as keyof typeof countLabels]}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
