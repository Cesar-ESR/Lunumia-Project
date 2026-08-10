import { useState, type FormEvent } from 'react'
import { createPeriodSchema } from '@application/contracts'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'

const initialForm = { type: 'monthly' as const, startDate: '', endDate: '' }

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
  const [form, setForm] = useState<{
    type: 'monthly' | 'biweekly'
    startDate: string
    endDate: string
  }>(initialForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const input = { ...form, ownerId: services.ownerId }
    const parsed = createPeriodSchema.safeParse(input)
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      nextErrors.endDate =
        'La fecha final debe ser igual o posterior a la inicial.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setIsSubmitting(true)
    setNotice(null)
    try {
      const created = await services.periods.createPeriod.execute(input)
      if (!activePeriod) await setActivePeriod(created.id)
      await refreshPeriods()
      setForm(initialForm)
      setNotice({ message: 'Periodo creado correctamente.', tone: 'success' })
    } catch (reason) {
      setNotice({ message: friendlyError(reason), tone: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Periodos"
        description="Divide tu dinero en intervalos claros y elige cuál quieres consultar."
      />
      {notice ? <Notice {...notice} /> : null}
      <section className="panel split-layout">
        <form onSubmit={handleSubmit} noValidate>
          <h2>Crear periodo</h2>
          <div className="form-grid">
            <FormField id="period-type" label="Tipo" error={errors.type}>
              <select
                id="period-type"
                value={form.type}
                aria-describedby={errors.type ? 'period-type-error' : undefined}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as 'monthly' | 'biweekly',
                  })
                }
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
                value={form.startDate}
                aria-describedby={
                  errors.startDate ? 'period-start-error' : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
              />
            </FormField>
            <FormField
              id="period-end"
              label="Fecha final"
              error={errors.endDate}
            >
              <input
                id="period-end"
                type="date"
                value={form.endDate}
                aria-describedby={
                  errors.endDate ? 'period-end-error' : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
              />
            </FormField>
          </div>
          <div className="form-actions">
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Crear periodo'}
            </button>
          </div>
        </form>
        <div>
          <h2>Periodos disponibles</h2>
          {isLoading ? (
            <LoadingState message="Cargando periodos…" />
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
            <div className="record-list">
              {periods.map((period) => (
                <article
                  key={period.id}
                  className={`record-card ${activePeriod?.id === period.id ? 'active-record' : ''}`}
                >
                  <div>
                    <span className="badge">
                      {period.type === 'monthly' ? 'Mensual' : 'Quincenal'}
                    </span>
                    {activePeriod?.id === period.id ? (
                      <span className="badge accent">Activo</span>
                    ) : null}
                    <h3>
                      {period.startDate} — {period.endDate}
                    </h3>
                  </div>
                  {activePeriod?.id !== period.id ? (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => void setActivePeriod(period.id)}
                    >
                      Usar este periodo
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
