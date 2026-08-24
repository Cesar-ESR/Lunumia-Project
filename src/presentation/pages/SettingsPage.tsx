import { useRef, useState, type ChangeEvent } from 'react'
import {
  Database,
  Download,
  LockKeyhole,
  MonitorSmartphone,
  SlidersHorizontal,
  UserCircle,
} from 'lucide-react'
import type { PreparedBackup } from '@application/services/BackupService'
import { MAX_BACKUP_FILE_SIZE_BYTES } from '@shared/constants'
import { AccountControls } from '../components/AccountControls'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DeleteAccountSection } from '../components/DeleteAccountSection'
import { InstallAppButton } from '../components/InstallAppButton'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { SyncStatusView } from '../components/SyncStatusIndicator'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAuth } from '../context/AuthContext'
import { usePeriod } from '../context/PeriodContext'
import { useSync } from '../context/SyncContext'

const countLabels = {
  periods: 'Periodos',
  incomes: 'Ingresos',
  expenses: 'Gastos',
  categories: 'Categorías',
  categoryBudgets: 'Presupuestos',
  recurringPayments: 'Compromisos',
  recurringPaymentOccurrences: 'Ocurrencias',
  balanceAnchors: 'Registros de saldo',
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
  if (file.type && !['application/json', 'text/json'].includes(file.type))
    throw new Error('El archivo seleccionado no tiene un tipo JSON válido.')
}

export function SettingsPage() {
  const services = useApplicationServices()
  const auth = useAuth()
  const sync = useSync()
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
          'Respaldo restaurado. La información local ya está actualizada.',
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
        eyebrow="Cuenta y datos"
        title="Configuración"
        description="Controla tu cuenta, tus respaldos y las capacidades compatibles de esta aplicación."
      />
      {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}

      <div className="ln-settings-flow">
        <section aria-labelledby="settings-account-title">
          <SettingsHeading
            icon={UserCircle}
            eyebrow="Cuenta"
            id="settings-account-title"
            title="Tu acceso"
            description={
              auth.user
                ? 'Administra la sesión y los datos locales asociados a tu cuenta.'
                : 'Estás usando Lunumia como invitado. Crear una cuenta es opcional.'
            }
          />
          <Surface className="ln-settings-account">
            {!auth.user ? (
              <p>
                <strong>Guardado en este dispositivo.</strong> Tus datos locales
                siguen disponibles sin una cuenta.
              </p>
            ) : null}
            <AccountControls />
          </Surface>
        </section>

        <section aria-labelledby="settings-preferences-title">
          <SettingsHeading
            icon={SlidersHorizontal}
            eyebrow="Preferencias"
            id="settings-preferences-title"
            title="Preferencias compatibles"
            description="Sólo mostramos opciones que funcionan completamente en UX 2.0."
          />
          <div className="ln-settings-summary-grid">
            <Surface variant="subtle">
              <h3>Moneda</h3>
              <strong>Pesos mexicanos (MXN)</strong>
              <p>La moneda es fija durante UX 2.0.</p>
            </Surface>
            <Surface variant="subtle">
              <h3>Apariencia</h3>
              <strong>Modo claro</strong>
              <p>El modo oscuro todavía no forma parte de esta versión.</p>
            </Surface>
          </div>
        </section>

        <section aria-labelledby="settings-data-title">
          <SettingsHeading
            icon={Database}
            eyebrow="Tus datos"
            id="settings-data-title"
            title="Datos y respaldo"
            description="Exporta una copia o restaura un archivo validado de forma deliberada."
          />
          <div className="ln-settings-grid">
            <Surface
              className="ln-settings-card"
              aria-labelledby="export-title"
            >
              <Download aria-hidden="true" />
              <div>
                <h3 id="export-title">Exportar datos</h3>
                <p>
                  Descarga periodos, movimientos, categorías, presupuestos,
                  compromisos y configuración en un respaldo versionado.
                </p>
              </div>
              <Button
                loading={isExporting}
                loadingLabel="Preparando respaldo…"
                onClick={() => void exportBackup()}
              >
                Exportar respaldo
              </Button>
            </Surface>
            <Surface
              className="ln-settings-card"
              aria-labelledby="import-title"
            >
              <Database aria-hidden="true" />
              <div>
                <h3 id="import-title">Restaurar respaldo</h3>
                <p>
                  El archivo se valida por completo. Tras revisar el resumen,
                  una confirmación explícita reemplaza los datos actuales de
                  este usuario local.
                </p>
              </div>
              <label className="ln-button ln-button--secondary file-button">
                Seleccionar archivo JSON
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void selectFile(event)}
                />
              </label>
            </Surface>
          </div>
          <Surface variant="subtle" className="ln-settings-sync">
            <h3>Sincronización</h3>
            {sync.isAvailable && sync.ownerId ? (
              <>
                <SyncStatusView sync={sync} />
                <dl>
                  <div>
                    <dt>Cambios pendientes</dt>
                    <dd>{sync.pendingCount}</dd>
                  </div>
                  <div>
                    <dt>Última sincronización correcta</dt>
                    <dd>
                      {sync.lastSuccessfulSyncAt
                        ? new Date(sync.lastSuccessfulSyncAt).toLocaleString(
                            'es-MX',
                          )
                        : 'Aún no disponible'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p>
                En modo invitado los datos se guardan en este dispositivo y no
                se sincronizan con una cuenta.
              </p>
            )}
          </Surface>
        </section>

        <section aria-labelledby="settings-app-title">
          <SettingsHeading
            icon={MonitorSmartphone}
            eyebrow="Aplicación y dispositivo"
            id="settings-app-title"
            title="Instalación, conexión y actualizaciones"
            description="Las actualizaciones de la aplicación se presentan separadas de la sincronización de datos."
          />
          <Surface className="ln-settings-application">
            <div>
              <h3>Instalar Lunumia</h3>
              <p>
                La opción aparece únicamente cuando este navegador permite la
                instalación.
              </p>
            </div>
            <InstallAppButton />
            <Notice
              tone="info"
              message="Sin conexión, tus cambios se guardan en este dispositivo. Cuando exista una nueva versión, Lunumia mostrará un aviso específico de actualización."
            />
          </Surface>
        </section>

        <section aria-labelledby="settings-privacy-title">
          <SettingsHeading
            icon={LockKeyhole}
            eyebrow="Privacidad y seguridad"
            id="settings-privacy-title"
            title="Cómo se usan tus datos"
            description="Resumen de los flujos que la aplicación ya soporta."
          />
          <Surface className="ln-settings-privacy">
            <ul>
              <li>Los respaldos se preparan y validan en este dispositivo.</li>
              <li>
                Con una cuenta, la sincronización usa el servicio remoto
                configurado para mantener tus datos disponibles.
              </li>
              <li>
                Las explicaciones con IA y el reconocimiento de recibos pueden
                enviar el resumen o la imagen necesarios a un servicio remoto
                sólo cuando solicitas esas funciones.
              </li>
            </ul>
          </Surface>
        </section>

        <DeleteAccountSection />
      </div>

      <ConfirmDialog
        open={prepared !== null}
        title="Reemplazar información local"
        description="Esta acción sustituirá los datos actuales de este usuario por el contenido validado del respaldo."
        confirmLabel="Restaurar y reemplazar"
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
              <strong>Versión del respaldo:</strong>{' '}
              {prepared.summary.schemaVersion}
            </p>
            <dl>
              {Object.entries(prepared.summary.counts).map(([key, count]) => (
                <div key={key}>
                  <dt>{countLabels[key as keyof typeof countLabels] ?? key}</dt>
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

function SettingsHeading({
  icon: Icon,
  eyebrow,
  id,
  title,
  description,
}: {
  icon: typeof Database
  eyebrow: string
  id: string
  title: string
  description: string
}) {
  return (
    <div className="ln-settings-heading">
      <Icon aria-hidden="true" />
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}
