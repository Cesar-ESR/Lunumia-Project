import { useState, type FormEvent } from 'react'
import { CalendarDays, CheckCircle2 } from 'lucide-react'
import { createPeriodSchema } from '@application/contracts'
import type { Period, PeriodType } from '@domain/entities'
import { derivePeriodEndDate } from '@domain/rules'
import { isDateOnly } from '@domain/value-objects'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'
import { formatCompactDate } from '../utils/movement-view-model'

const initialForm = { type: 'monthly' as const, startDate: '', endDate: '' }
type PeriodForm = {
  type: PeriodType
  startDate: string
  endDate: string
}

function deriveFormEndDate(type: PeriodType, startDate: string): string {
  return isDateOnly(startDate) ? derivePeriodEndDate(type, startDate) : ''
}

export function PeriodsPage() {
  const services = useApplicationServices()
  const {
    periods,
    activePeriod,
    isLoading,
    error,
    setActivePeriod,
    refreshPeriods,
  } = usePeriod()
  const [form, setForm] = useState<PeriodForm>(initialForm)
  const [editing, setEditing] = useState<Period | null>(null)
  const [deleting, setDeleting] = useState<Period | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setForm(initialForm)
    setEditing(null)
    setErrors({})
  }

  const beginEdit = (period: Period) => {
    setEditing(period)
    setForm({
      type: period.type,
      startDate: period.startDate,
      endDate: derivePeriodEndDate(period.type, period.startDate),
    })
    setErrors({})
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const input = {
      ...form,
      endDate: deriveFormEndDate(form.type, form.startDate),
      ownerId: services.ownerId,
    }
    const parsed = createPeriodSchema.safeParse(input)
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (input.startDate && input.endDate && input.startDate > input.endDate)
      nextErrors.endDate =
        'La fecha final debe ser igual o posterior a la inicial.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setIsSubmitting(true)
    setNotice(null)
    try {
      if (editing)
        await services.periods.updatePeriod.execute(editing.id, input)
      else {
        const created = await services.periods.createPeriod.execute(input)
        if (!activePeriod) await setActivePeriod(created.id)
      }
      await refreshPeriods()
      setNotice({
        message: editing
          ? 'Periodo actualizado correctamente.'
          : 'Periodo creado correctamente.',
        tone: 'success',
      })
      resetForm()
    } catch (reason) {
      setNotice({ message: friendlyError(reason), tone: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectPeriod = async (periodId: string) => {
    setNotice(null)
    try {
      await setActivePeriod(periodId)
      setNotice({
        tone: 'success',
        message:
          'Periodo seleccionado para navegar por el plan y la actividad.',
      })
    } catch (reason) {
      setNotice({ tone: 'error', message: friendlyError(reason) })
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setIsSubmitting(true)
    setNotice(null)
    try {
      await services.periods.deletePeriod.execute(deleting.id)
      if (editing?.id === deleting.id) resetForm()
      setDeleting(null)
      await refreshPeriods()
      setNotice({ tone: 'success', message: 'Periodo eliminado.' })
    } catch (reason) {
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Periodos"
        description="Crea intervalos y elige cuál quieres consultar en Plan y Movimientos. Esta selección no redefine por sí sola el periodo vigente de FinancialSnapshot."
      />
      {notice ? <Notice {...notice} /> : null}
      <div className="ln-management-layout">
        <Surface
          className="ln-management-form"
          aria-labelledby="period-form-title"
        >
          <div className="ln-management-heading">
            <CalendarDays aria-hidden="true" />
            <div>
              <p className="eyebrow">Organizar</p>
              <h2 id="period-form-title">
                {editing ? 'Editar periodo' : 'Crear periodo'}
              </h2>
            </div>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <FormField id="period-type" label="Tipo" error={errors.type}>
                <select
                  id="period-type"
                  required
                  value={form.type}
                  onChange={(event) => {
                    const type = event.target.value as PeriodType
                    setForm((current) => ({
                      ...current,
                      type,
                      endDate: deriveFormEndDate(type, current.startDate),
                    }))
                  }}
                >
                  <option value="monthly">Mensual</option>
                  <option value="biweekly">Quincenal</option>
                </select>
              </FormField>
              <span />
              <FormField
                id="period-start"
                label="Fecha inicial"
                error={errors.startDate}
              >
                <input
                  id="period-start"
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(event) => {
                    const startDate = event.target.value
                    setForm((current) => ({
                      ...current,
                      startDate,
                      endDate: deriveFormEndDate(current.type, startDate),
                    }))
                  }}
                />
              </FormField>
              <FormField
                id="period-end"
                label="Fecha final"
                error={errors.endDate}
                hint="La fecha final se calcula según el tipo de periodo."
                readOnly
              >
                <input id="period-end" type="date" value={form.endDate} />
              </FormField>
            </div>
            <div className="ln-form-actions">
              {editing ? (
                <Button
                  variant="secondary"
                  onClick={resetForm}
                  disabled={isSubmitting}
                >
                  Cancelar edición
                </Button>
              ) : null}
              <Button
                type="submit"
                loading={isSubmitting}
                loadingLabel="Guardando…"
              >
                {editing ? 'Guardar cambios' : 'Crear periodo'}
              </Button>
            </div>
          </form>
        </Surface>

        <section aria-labelledby="period-list-title">
          <div className="ln-section-heading">
            <div>
              <p className="eyebrow">Contexto de navegación</p>
              <h2 id="period-list-title">Periodos disponibles</h2>
              <p>“Seleccionado” indica el periodo que estás explorando.</p>
            </div>
          </div>
          {isLoading ? (
            <LoadingState variant="skeleton" message="Cargando periodos…" />
          ) : error ? (
            <ErrorState
              message={error.message}
              onRetry={() => void refreshPeriods()}
            />
          ) : periods.length === 0 ? (
            <EmptyState
              title="Aún no hay periodos"
              description="Crea tu primer periodo para comenzar a registrar movimientos."
            />
          ) : (
            <div className="ln-management-list">
              {periods.map((period) => {
                const selected = activePeriod?.id === period.id
                return (
                  <Surface
                    as="article"
                    className="ln-management-row"
                    key={period.id}
                  >
                    <div>
                      <span className="ln-status-label">
                        {period.type === 'monthly' ? 'Mensual' : 'Quincenal'}
                      </span>
                      <h3>
                        {formatCompactDate(period.startDate)} —{' '}
                        {formatCompactDate(period.endDate)}
                      </h3>
                      {selected ? (
                        <p className="ln-management-selected">
                          <CheckCircle2 aria-hidden="true" /> Periodo
                          seleccionado
                        </p>
                      ) : null}
                    </div>
                    <div className="ln-management-actions">
                      {!selected ? (
                        <Button
                          variant="secondary"
                          onClick={() => void selectPeriod(period.id)}
                        >
                          Seleccionar
                        </Button>
                      ) : null}
                      <Button variant="ghost" onClick={() => beginEdit(period)}>
                        Editar
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setDeleting(period)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </Surface>
                )
              })}
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Eliminar periodo"
        description={
          deleting
            ? `Se eliminará el periodo ${formatCompactDate(deleting.startDate)} — ${formatCompactDate(deleting.endDate)}. Esta acción usa las reglas actuales de eliminación de periodos.`
            : ''
        }
        confirmLabel="Eliminar periodo"
        isPending={isSubmitting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
