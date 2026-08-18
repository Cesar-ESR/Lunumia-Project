import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createIncomeSchema } from '@application/contracts'
import type { Income } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'

function newForm() {
  return { amount: '', description: '', date: getLocalDateOnly() }
}

export function IncomesPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const load = useCallback(
    async () =>
      activePeriod
        ? services.incomes.listIncomesByPeriod.execute(activePeriod.id)
        : [],
    [activePeriod, services],
  )
  const incomes = useAsyncData(load)
  const [form, setForm] = useState(newForm)
  const [editing, setEditing] = useState<Income | null>(null)
  const [deletion, setDeletion] = useState<Income | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Movimientos"
          title="Ingresos"
          description="Registra el dinero que recibes durante el periodo."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo antes de registrar ingresos."
          action={
            <Link className="button" to="/periods">
              Administrar periodos
            </Link>
          }
        />
      </>
    )

  const resetForm = () => {
    setForm(newForm())
    setEditing(null)
    setErrors({})
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = parseMoneyInputToCents(form.amount)
    const input = {
      ownerId: services.ownerId,
      periodId: activePeriod.id,
      amount,
      description: form.description,
      date: form.date,
    }
    const parsed = createIncomeSchema.safeParse(input)
    const next = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (amount === null)
      next.amount = 'Escribe un monto positivo con máximo dos decimales.'
    if (
      form.date &&
      (form.date < activePeriod.startDate || form.date > activePeriod.endDate)
    )
      next.date = 'La fecha debe estar dentro del periodo activo.'
    if (Object.keys(next).length || !parsed.success) {
      setErrors(next)
      return
    }
    setIsPending(true)
    setNotice(null)
    try {
      if (editing)
        await services.incomes.updateIncome.execute(editing.id, parsed.data)
      else await services.incomes.createIncome.execute(parsed.data)
      resetForm()
      incomes.refresh()
    } catch (reason) {
      setNotice(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }

  const beginEdit = (income: Income) => {
    setEditing(income)
    setForm({
      amount: formatCentsForInput(income.amount),
      description: income.description,
      date: income.date,
    })
    setErrors({})
  }
  const confirmDelete = async () => {
    if (!deletion) return
    setIsPending(true)
    try {
      await services.incomes.deleteIncome.execute(deletion.id)
      if (editing?.id === deletion.id) resetForm()
      setDeletion(null)
      incomes.refresh()
    } catch (reason) {
      setNotice(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }

  const totalReceived = (incomes.data ?? [])
    .filter((income) => !('status' in income) || income.status === 'received')
    .reduce((sum, income) => sum + income.amount, 0)
  return (
    <>
      <PageHeader
        eyebrow="Movimientos"
        title="Ingresos"
        description={`${activePeriod.startDate} — ${activePeriod.endDate}`}
        actions={
          <div className="summary-pill">
            <span>Total recibido</span>
            <MoneyDisplay amount={totalReceived} />
          </div>
        }
      />
      {notice ? <Notice tone="error" message={notice} /> : null}
      <div className="split-layout">
        <section className="panel">
          <h2>{editing ? 'Editar ingreso' : 'Nuevo ingreso'}</h2>
          <form className="stack-form" onSubmit={submit} noValidate>
            <FormField id="income-amount" label="Monto" error={errors.amount}>
              <input
                id="income-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                aria-describedby={
                  errors.amount ? 'income-amount-error' : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </FormField>
            <FormField
              id="income-description"
              label="Descripción"
              error={errors.description}
            >
              <input
                id="income-description"
                maxLength={200}
                value={form.description}
                aria-describedby={
                  errors.description ? 'income-description-error' : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </FormField>
            <FormField id="income-date" label="Fecha" error={errors.date}>
              <input
                id="income-date"
                type="date"
                min={activePeriod.startDate}
                max={activePeriod.endDate}
                value={form.date}
                aria-describedby={errors.date ? 'income-date-error' : undefined}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </FormField>
            <div className="form-actions">
              {editing ? (
                <button
                  type="button"
                  className="button ghost"
                  disabled={isPending}
                  onClick={resetForm}
                >
                  Cancelar
                </button>
              ) : null}
              <button className="button" disabled={isPending}>
                {isPending
                  ? 'Guardando…'
                  : editing
                    ? 'Guardar cambios'
                    : 'Agregar ingreso'}
              </button>
            </div>
          </form>
        </section>
        <section className="panel">
          <h2>Ingresos del periodo</h2>
          {incomes.status === 'loading' && !incomes.data ? (
            <LoadingState message="Cargando ingresos…" />
          ) : null}
          {incomes.status === 'error' ? (
            <ErrorState
              message={incomes.error.message}
              onRetry={incomes.refresh}
            />
          ) : null}
          {incomes.data?.length === 0 ? (
            <EmptyState
              title="Aún no hay ingresos"
              description="Registra el primer ingreso de este periodo."
            />
          ) : null}
          {incomes.data?.length ? (
            <div className="record-list">
              {incomes.data.map((income) => (
                <article className="record-card" key={income.id}>
                  <div>
                    <p className="record-date">{income.date}</p>
                    <h3>{income.description}</h3>
                    <MoneyDisplay
                      amount={income.amount}
                      className="record-amount positive"
                    />
                  </div>
                  <div className="record-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => beginEdit(income)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="button ghost danger-text"
                      onClick={() => setDeletion(income)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deletion)}
        title="Eliminar ingreso"
        description={
          deletion
            ? `Se eliminará “${deletion.description}” por ${formatCentsForInput(deletion.amount)} MXN.`
            : ''
        }
        confirmLabel="Eliminar ingreso"
        isPending={isPending}
        onCancel={() => setDeletion(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
