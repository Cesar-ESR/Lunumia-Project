import { useCallback, useState, type FormEvent } from 'react'
import { createRecurringPaymentSchema } from '@application/contracts'
import type {
  RecurringPayment,
  RecurringPaymentOccurrence,
} from '@domain/entities'
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

const blankForm = {
  name: '',
  amount: '',
  frequency: 'monthly' as const,
  dueDate: '',
  endDate: '',
  categoryId: '',
  status: 'active' as const,
}
type DialogAction =
  | { type: 'delete'; payment: RecurringPayment }
  | { type: 'paid' | 'skipped'; occurrence: RecurringPaymentOccurrence }

export function RecurringPaymentsPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    if (activePeriod)
      await services.recurringPayments.generateOccurrencesForPeriod.execute(
        services.ownerId,
        activePeriod.id,
      )
    const [overview, categories] = await Promise.all([
      services.recurringPayments.getOverview.execute(activePeriod?.id ?? null),
      services.categories.listCategories.execute(),
    ])
    return { ...overview, categories }
  }, [activePeriod, services])
  const data = useAsyncData(load)
  const [form, setForm] = useState<{
    name: string
    amount: string
    frequency: 'weekly' | 'biweekly' | 'monthly'
    dueDate: string
    endDate: string
    categoryId: string
    status: 'active' | 'inactive'
  }>(blankForm)
  const [editing, setEditing] = useState<RecurringPayment | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [dialog, setDialog] = useState<DialogAction | null>(null)
  const [paidDate, setPaidDate] = useState('')
  const [paidDateError, setPaidDateError] = useState<string | null>(null)
  const resetForm = () => {
    setForm(blankForm)
    setEditing(null)
    setErrors({})
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = parseMoneyInputToCents(form.amount)
    const input = {
      ownerId: services.ownerId,
      name: form.name,
      amount,
      frequency: form.frequency,
      dueDate: form.dueDate,
      endDate: form.endDate || null,
      categoryId: form.categoryId,
      status: form.status,
    }
    const parsed = createRecurringPaymentSchema.safeParse(input)
    if (!parsed.success) {
      const next = zodFieldErrors(parsed.error)
      if (amount === null)
        next.amount = 'Escribe un monto positivo con máximo dos decimales.'
      setErrors(next)
      return
    }
    setIsPending(true)
    setNotice(null)
    try {
      if (editing)
        await services.recurringPayments.updateRecurringPayment.execute(
          editing.id,
          parsed.data,
        )
      else
        await services.recurringPayments.createRecurringPayment.execute(
          parsed.data,
        )
      resetForm()
      data.refresh()
    } catch (reason) {
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }
  const beginEdit = (payment: RecurringPayment) => {
    setEditing(payment)
    setForm({
      name: payment.name,
      amount: formatCentsForInput(payment.amount),
      frequency: payment.frequency,
      dueDate: payment.dueDate,
      endDate: payment.endDate ?? '',
      categoryId: payment.categoryId,
      status: payment.status,
    })
    setErrors({})
  }
  const toggle = async (payment: RecurringPayment) => {
    setIsPending(true)
    try {
      await services.recurringPayments.toggleRecurringPaymentStatus.execute(
        payment.id,
      )
      data.refresh()
    } catch (reason) {
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }
  const openPaidDialog = (occurrence: RecurringPaymentOccurrence) => {
    const today = getLocalDateOnly()
    const initialDate =
      activePeriod &&
      today >= activePeriod.startDate &&
      today <= activePeriod.endDate
        ? today
        : occurrence.dueDate
    setPaidDate(initialDate)
    setPaidDateError(null)
    setDialog({ type: 'paid', occurrence })
  }
  const closeDialog = () => {
    setDialog(null)
    setPaidDateError(null)
  }
  const confirmAction = async () => {
    if (!dialog || (!activePeriod && dialog.type !== 'delete')) return
    if (
      dialog.type === 'paid' &&
      (!paidDate ||
        paidDate < activePeriod!.startDate ||
        paidDate > activePeriod!.endDate)
    ) {
      setPaidDateError('La fecha de pago debe estar dentro del periodo activo.')
      return
    }
    setIsPending(true)
    try {
      if (dialog.type === 'delete')
        await services.recurringPayments.deleteRecurringPayment.execute(
          dialog.payment.id,
        )
      else if (dialog.type === 'paid')
        await services.recurringPayments.markOccurrenceAsPaid.execute({
          ownerId: services.ownerId,
          occurrenceId: dialog.occurrence.id,
          paidDate,
        })
      else
        await services.recurringPayments.markOccurrenceAsSkipped.execute(
          activePeriod!.id,
          dialog.occurrence.id,
        )
      closeDialog()
      setNotice({
        tone: 'success',
        message:
          dialog.type === 'paid'
            ? 'Pago registrado como gasto.'
            : 'Cambio guardado correctamente.',
      })
      data.refresh()
    } catch (reason) {
      closeDialog()
      setNotice({ tone: 'error', message: friendlyError(reason) })
      data.refresh()
    } finally {
      setIsPending(false)
    }
  }
  const categoryNames = new Map(
    (data.data?.categories ?? []).map((category) => [
      category.id,
      category.name,
    ]),
  )
  const paymentById = new Map(
    (data.data?.payments ?? []).map((payment) => [payment.id, payment]),
  )
  const dialogContent =
    dialog?.type === 'delete'
      ? {
          title: 'Eliminar pago recurrente',
          description: `Se eliminará “${dialog.payment.name}”. Sus ocurrencias históricas no se modificarán.`,
          label: 'Eliminar pago',
        }
      : dialog?.type === 'paid'
        ? {
            title: 'Marcar como pagado',
            description:
              'Selecciona la fecha que se usará para crear el gasto.',
            label: 'Registrar pago',
          }
        : {
            title: 'Omitir ocurrencia',
            description:
              'La ocurrencia se marcará como omitida y no se creará ningún gasto.',
            label: 'Omitir',
          }
  return (
    <>
      <PageHeader
        eyebrow="Compromisos"
        title="Pagos recurrentes"
        description="Configura pagos frecuentes y controla cada vencimiento."
        actions={
          <div className="summary-pill">
            <span>Pendientes</span>
            <MoneyDisplay amount={data.data?.pendingCommitments ?? 0} />
          </div>
        }
      />
      {notice ? <Notice {...notice} /> : null}
      {data.status === 'error' ? (
        <ErrorState message={data.error.message} onRetry={data.refresh} />
      ) : null}
      <div className="split-layout">
        <section className="panel">
          <h2>{editing ? 'Editar pago' : 'Nuevo pago recurrente'}</h2>
          {data.status === 'loading' && !data.data ? (
            <LoadingState message="Preparando formulario…" />
          ) : (
            <form className="stack-form" onSubmit={submit} noValidate>
              <FormField id="recurring-name" label="Nombre" error={errors.name}>
                <input
                  id="recurring-name"
                  maxLength={200}
                  value={form.name}
                  aria-describedby={
                    errors.name ? 'recurring-name-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </FormField>
              <FormField
                id="recurring-amount"
                label="Monto"
                error={errors.amount}
              >
                <input
                  id="recurring-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amount}
                  aria-describedby={
                    errors.amount ? 'recurring-amount-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({ ...form, amount: event.target.value })
                  }
                />
              </FormField>
              <FormField
                id="recurring-frequency"
                label="Frecuencia"
                error={errors.frequency}
              >
                <select
                  id="recurring-frequency"
                  value={form.frequency}
                  aria-describedby={
                    errors.frequency ? 'recurring-frequency-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      frequency: event.target.value as typeof form.frequency,
                    })
                  }
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </FormField>
              <FormField
                id="recurring-date"
                label="Fecha inicial"
                error={errors.dueDate}
              >
                <input
                  id="recurring-date"
                  type="date"
                  value={form.dueDate}
                  aria-describedby={
                    errors.dueDate ? 'recurring-date-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({ ...form, dueDate: event.target.value })
                  }
                />
              </FormField>
              <FormField
                id="recurring-end-date"
                label="Fecha final (opcional)"
                error={errors.endDate}
              >
                <input
                  id="recurring-end-date"
                  type="date"
                  min={form.dueDate || undefined}
                  value={form.endDate}
                  aria-describedby={
                    errors.endDate ? 'recurring-end-date-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({ ...form, endDate: event.target.value })
                  }
                />
              </FormField>
              <FormField
                id="recurring-category"
                label="Categoría"
                error={errors.categoryId}
              >
                <select
                  id="recurring-category"
                  value={form.categoryId}
                  aria-describedby={
                    errors.categoryId ? 'recurring-category-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                >
                  <option value="">Selecciona una categoría</option>
                  {data.data?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                id="recurring-status"
                label="Estado"
                error={errors.status}
              >
                <select
                  id="recurring-status"
                  value={form.status}
                  aria-describedby={
                    errors.status ? 'recurring-status-error' : undefined
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as typeof form.status,
                    })
                  }
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </FormField>
              <div className="form-actions">
                {editing ? (
                  <button
                    type="button"
                    className="button ghost"
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
                      : 'Crear pago'}
                </button>
              </div>
            </form>
          )}
        </section>
        <section className="panel">
          <h2>Pagos configurados</h2>
          {data.data?.payments.length === 0 ? (
            <EmptyState
              title="Aún no hay pagos recurrentes"
              description="Agrega el primero para anticipar tus compromisos."
            />
          ) : (
            <div className="record-list">
              {data.data?.payments.map((payment) => (
                <article className="record-card" key={payment.id}>
                  <div>
                    <span
                      className={`badge ${payment.status === 'active' ? 'accent' : ''}`}
                    >
                      {payment.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                    <h3>{payment.name}</h3>
                    <p className="record-date">
                      {payment.frequency === 'weekly'
                        ? 'Semanal'
                        : payment.frequency === 'biweekly'
                          ? 'Quincenal'
                          : 'Mensual'}{' '}
                      · {categoryNames.get(payment.categoryId)}
                      {payment.endDate ? ` · hasta ${payment.endDate}` : ''}
                    </p>
                    <MoneyDisplay
                      amount={payment.amount}
                      className="record-amount"
                    />
                  </div>
                  <div className="record-actions">
                    <button
                      type="button"
                      className="button ghost"
                      disabled={isPending}
                      onClick={() => void toggle(payment)}
                    >
                      {payment.status === 'active' ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => beginEdit(payment)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="button ghost danger-text"
                      onClick={() => setDialog({ type: 'delete', payment })}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel recurring-occurrences">
        <h2>Ocurrencias del periodo activo</h2>
        {!activePeriod ? (
          <EmptyState
            title="Sin periodo activo"
            description="Selecciona un periodo para generar y consultar vencimientos."
          />
        ) : data.data?.occurrences.length === 0 ? (
          <EmptyState
            title="Sin ocurrencias"
            description="No hay vencimientos recurrentes dentro de este periodo."
          />
        ) : (
          <div className="record-list">
            {data.data?.occurrences.map((occurrence) => {
              const payment = paymentById.get(occurrence.recurringPaymentId)
              return (
                <article className="record-card" key={occurrence.id}>
                  <div>
                    <span className={`badge status-${occurrence.status}`}>
                      {occurrence.status === 'pending'
                        ? 'Pendiente'
                        : occurrence.status === 'paid'
                          ? 'Pagado'
                          : 'Omitido'}
                    </span>
                    <h3>{payment?.name ?? 'Pago recurrente'}</h3>
                    <p className="record-date">
                      Vence {occurrence.dueDate} ·{' '}
                      {payment ? categoryNames.get(payment.categoryId) : ''}
                    </p>
                    {payment ? (
                      <MoneyDisplay
                        amount={payment.amount}
                        className="record-amount"
                      />
                    ) : null}
                  </div>
                  {occurrence.status === 'pending' ? (
                    <div className="record-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => openPaidDialog(occurrence)}
                      >
                        Marcar como pagado
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() =>
                          setDialog({ type: 'skipped', occurrence })
                        }
                      >
                        Omitir
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialogContent.title}
        description={dialogContent.description}
        confirmLabel={dialogContent.label}
        isPending={isPending}
        onCancel={closeDialog}
        onConfirm={() => void confirmAction()}
      >
        {dialog?.type === 'paid' && activePeriod ? (
          <FormField
            id="paid-date"
            label="Fecha de pago"
            error={paidDateError ?? undefined}
          >
            <input
              id="paid-date"
              type="date"
              min={activePeriod.startDate}
              max={activePeriod.endDate}
              value={paidDate}
              aria-describedby={paidDateError ? 'paid-date-error' : undefined}
              onChange={(event) => {
                setPaidDate(event.target.value)
                setPaidDateError(null)
              }}
            />
          </FormField>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
