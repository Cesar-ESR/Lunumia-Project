import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createPeriodSchema } from '@application/contracts'
import type { Period } from '@domain/entities'
import { Button } from '../../components/Button'
import { FormField } from '../../components/FormField'
import { Notice } from '../../components/Notice'
import { Surface } from '../../components/Surface'
import { useApplicationServices } from '../../context/ApplicationServicesContext'
import { usePeriod } from '../../context/PeriodContext'
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard'
import {
  friendlyError,
  zodFieldErrors,
  type FieldErrors,
} from '../../utils/forms'
import {
  createMonthlyPeriodProposal,
  formatPeriodProposal,
  readInternalDestination,
  resolvePeriodProposal,
  type PeriodProposal,
} from '../../utils/first-time'
import { SetupPageLayout } from './SetupPageLayout'

export function InitialPeriodPage() {
  const services = useApplicationServices()
  const periodContext = usePeriod()
  const location = useLocation()
  const navigate = useNavigate()
  const proposal = useMemo(() => createMonthlyPeriodProposal(), [])
  const [form, setForm] = useState<PeriodProposal>({ ...proposal })
  const [editing, setEditing] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [existingPeriod, setExistingPeriod] = useState<Period | null>(null)
  const [pending, setPending] = useState(false)
  const destination = readInternalDestination(location.state)
  const dirty =
    editing &&
    (form.type !== proposal.type ||
      form.startDate !== proposal.startDate ||
      form.endDate !== proposal.endDate)
  const { guardDialog } = useUnsavedChangesGuard({ dirty, pending })

  const continueWithPeriod = async (period: Period) => {
    await periodContext.setActivePeriod(period.id)
    await periodContext.refreshPeriods()
    navigate('/saldo/inicial', { replace: true, state: { from: destination } })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    const input = { ...form, ownerId: services.ownerId }
    const parsed = createPeriodSchema.safeParse(input)
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      nextErrors.endDate =
        'La fecha final debe ser igual o posterior a la inicial.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    setNotice(null)
    setExistingPeriod(null)
    try {
      const created = await services.periods.createPeriod.execute(input)
      await continueWithPeriod(created)
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'PeriodOverlapError') {
        const periods = await services.periods.listPeriods.execute()
        const existing = periods.find(
          (period) =>
            period.deletedAt === null &&
            period.startDate <= form.endDate &&
            form.startDate <= period.endDate,
        )
        setExistingPeriod(existing ?? null)
        setNotice('Ya tienes un periodo para estas fechas.')
      } else setNotice(friendlyError(reason))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <SetupPageLayout step="Paso 2 de 3">
        <div className="ln-setup-card">
          <header>
            <p className="eyebrow">Primera configuración</p>
            <h1 tabIndex={-1}>Organicemos tus movimientos</h1>
            <p>
              Lunumia usa periodos para agrupar tus movimientos y ayudarte a
              entender mejor tus ingresos, gastos y planificación.
            </p>
          </header>

          {notice ? (
            <Notice
              tone={existingPeriod ? 'warning' : 'danger'}
              title={
                existingPeriod
                  ? 'Periodo existente'
                  : 'No pudimos crear el periodo'
              }
              message={notice}
            />
          ) : null}

          {Object.keys(errors).length > 1 ? (
            <div className="ln-error-summary" role="alert" tabIndex={-1}>
              <strong>Revisa los datos del periodo:</strong>
              <ul>
                {Object.values(errors).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Surface variant="subtle" className="ln-period-proposal">
            <p className="ln-period-proposal__label">Periodo sugerido</p>
            <span>{form.type === 'monthly' ? 'Mensual' : 'Quincenal'}</span>
            <strong>{formatPeriodProposal(form)}</strong>
            <p className="ln-period-proposal__help">
              Puedes usar esta propuesta o elegir una quincena u otras fechas.
            </p>
          </Surface>

          <form
            className="ln-setup-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            {editing ? (
              <div
                id="setup-period-editor"
                className="ln-period-editor"
                aria-describedby="setup-period-editor-help"
              >
                <p id="setup-period-editor-help">
                  Puedes elegir un periodo mensual o quincenal y ajustar las
                  fechas.
                </p>
                <div className="ln-form-grid">
                  <FormField
                    id="setup-period-type"
                    label="Tipo"
                    error={errors.type}
                  >
                    <select
                      id="setup-period-type"
                      value={form.type}
                      onChange={(event) => {
                        const type = event.target
                          .value as PeriodProposal['type']
                        setForm(resolvePeriodProposal(type))
                        setExistingPeriod(null)
                        setNotice(null)
                      }}
                    >
                      <option value="monthly">Mensual</option>
                      <option value="biweekly">Quincenal</option>
                    </select>
                  </FormField>
                  <FormField
                    id="setup-period-start"
                    label="Fecha inicial"
                    error={errors.startDate}
                  >
                    <input
                      id="setup-period-start"
                      type="date"
                      value={form.startDate}
                      onChange={(event) =>
                        setForm({ ...form, startDate: event.target.value })
                      }
                    />
                  </FormField>
                  <FormField
                    id="setup-period-end"
                    label="Fecha final"
                    error={errors.endDate}
                  >
                    <input
                      id="setup-period-end"
                      type="date"
                      value={form.endDate}
                      onChange={(event) =>
                        setForm({ ...form, endDate: event.target.value })
                      }
                    />
                  </FormField>
                </div>
              </div>
            ) : null}

            <div className="ln-setup-actions">
              {existingPeriod ? (
                <Button
                  type="button"
                  loading={pending}
                  onClick={() => void continueWithPeriod(existingPeriod)}
                >
                  Usar periodo existente
                </Button>
              ) : (
                <Button
                  type="submit"
                  loading={pending}
                  loadingLabel="Creando periodo…"
                >
                  Usar este periodo
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                aria-expanded={editing}
                aria-controls="setup-period-editor"
                onClick={() => {
                  setEditing((current) => !current)
                  setExistingPeriod(null)
                  setNotice(null)
                }}
              >
                {editing ? 'Ocultar opciones' : 'Cambiar periodo'}
              </Button>
            </div>
          </form>
        </div>
      </SetupPageLayout>
      {guardDialog}
    </>
  )
}
