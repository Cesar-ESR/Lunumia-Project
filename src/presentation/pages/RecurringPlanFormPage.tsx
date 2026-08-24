import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { createRecurringPaymentSchema } from '@application/contracts'
import type { Category, RecurringPayment } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { ErrorState } from '../components/ErrorState'
import { Button } from '../components/Button'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { MoneyField } from '../components/MoneyField'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'

interface PlanFormState {
  name: string
  amount: string
  frequency: 'weekly' | 'biweekly' | 'monthly'
  dueDate: string
  endDate: string
  categoryId: string
}

export function RecurringPlanFormPage() {
  const { id } = useParams<{ id?: string }>()
  const services = useApplicationServices()
  const load = useCallback(async () => {
    const [overview, categories] = await Promise.all([
      services.recurringPayments.getOverview.execute(null),
      services.categories.listCategories.execute(),
    ])
    return {
      plan: id
        ? (overview.payments.find((payment) => payment.id === id) ?? null)
        : null,
      categories,
    }
  }, [id, services])
  const data = useAsyncData(load)

  if (data.status === 'loading' && !data.data)
    return <LoadingState message="Preparando el plan recurrente…" />
  if (data.status === 'error')
    return (
      <ErrorState
        message="No pudimos preparar este plan recurrente."
        onRetry={data.refresh}
      />
    )
  if (!data.data) return null
  if (id && !data.data.plan)
    return (
      <ErrorState
        title="Plan no disponible"
        message="El plan no existe o ya no está disponible."
      />
    )

  return (
    <RecurringPlanForm
      key={data.data.plan?.id ?? 'new-plan'}
      plan={data.data.plan}
      categories={data.data.categories}
    />
  )
}

function RecurringPlanForm({
  plan,
  categories,
}: {
  plan: RecurringPayment | null
  categories: Category[]
}) {
  const services = useApplicationServices()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [initialForm] = useState<PlanFormState>(() => ({
    name: plan?.name ?? '',
    amount: plan ? formatCentsForInput(plan.amount) : '',
    frequency: plan?.frequency ?? 'monthly',
    dueDate: plan?.dueDate ?? getLocalDateOnly(),
    endDate: plan?.endDate ?? '',
    categoryId: plan?.categoryId ?? categories[0]?.id ?? '',
  }))
  const [form, setForm] = useState<PlanFormState>(initialForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const dirty = Object.entries(form).some(
    ([key, value]) => initialForm[key as keyof PlanFormState] !== value,
  )
  const { requestLeave, guardDialog } = useUnsavedChangesGuard({
    dirty,
    pending: isPending,
  })

  useEffect(() => {
    if (!Object.keys(errors).length) return
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus()
  }, [errors])

  const setField = <Key extends keyof PlanFormState>(
    field: Key,
    value: PlanFormState[Key],
  ) => setForm((current) => ({ ...current, [field]: value }))

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
      status: plan?.status ?? ('active' as const),
    }
    const parsed = createRecurringPaymentSchema.safeParse(input)
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (amount === null)
      nextErrors.amount = 'Escribe un monto positivo con máximo dos decimales.'
    if (Object.keys(nextErrors).length || !parsed.success) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setServerError(null)
    setIsPending(true)
    try {
      if (plan)
        await services.recurringPayments.updateRecurringPayment.execute(
          plan.id,
          parsed.data,
        )
      else
        await services.recurringPayments.createRecurringPayment.execute(
          parsed.data,
        )
      navigate('/plan/compromisos', {
        replace: true,
        state: {
          commitmentNotice: plan
            ? 'Plan actualizado. Las ocurrencias pasadas conservaron su monto original.'
            : 'Plan recurrente creado.',
        },
      })
    } catch (reason) {
      setServerError(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="ln-back-link"
        onClick={() => requestLeave(() => navigate('/plan/compromisos'))}
      >
        <ArrowLeft aria-hidden="true" /> Volver a Compromisos
      </button>
      <PageHeader
        eyebrow="Plan recurrente"
        title={plan ? `Editar ${plan.name}` : 'Crear plan recurrente'}
        description="Define lo que se repetirá; cada ocurrencia conservará su propio monto al generarse."
      />
      <Surface className="ln-plan-form-surface">
        <form
          ref={formRef}
          className="ln-plan-form"
          noValidate
          onSubmit={submit}
        >
          {serverError ? <Notice tone="error" message={serverError} /> : null}
          {Object.keys(errors).length ? (
            <div className="ln-error-summary" role="alert">
              <strong>Revisa los campos marcados.</strong>
            </div>
          ) : null}
          {plan ? (
            <Notice
              tone="info"
              title="El historial no cambia"
              message="Los cambios se aplican al plan y a sus futuras ocurrencias. Las ocurrencias ya generadas conservan su monto original."
            />
          ) : null}

          <FormField
            id="recurring-plan-name"
            label="Nombre del compromiso"
            error={errors.name}
            required
          >
            <input
              id="recurring-plan-name"
              maxLength={200}
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
            />
          </FormField>
          <MoneyField
            id="recurring-plan-amount"
            label="Monto planeado"
            value={form.amount}
            error={errors.amount}
            required
            onChange={(event) => setField('amount', event.target.value)}
          />
          <FormField
            id="recurring-plan-frequency"
            label="Frecuencia"
            error={errors.frequency}
            required
          >
            <select
              id="recurring-plan-frequency"
              value={form.frequency}
              onChange={(event) =>
                setField(
                  'frequency',
                  event.target.value as PlanFormState['frequency'],
                )
              }
            >
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="monthly">Mensual</option>
            </select>
          </FormField>
          <div className="ln-form-grid">
            <FormField
              id="recurring-plan-start"
              label="Primera fecha"
              error={errors.dueDate}
              required
            >
              <input
                id="recurring-plan-start"
                type="date"
                value={form.dueDate}
                onChange={(event) => setField('dueDate', event.target.value)}
              />
            </FormField>
            <FormField
              id="recurring-plan-end"
              label="Fecha final"
              hint="Déjala vacía si el plan no tiene fin."
              error={errors.endDate}
              optional
            >
              <input
                id="recurring-plan-end"
                type="date"
                min={form.dueDate || undefined}
                value={form.endDate}
                onChange={(event) => setField('endDate', event.target.value)}
              />
            </FormField>
          </div>
          <FormField
            id="recurring-plan-category"
            label="Categoría del gasto"
            error={errors.categoryId}
            required
          >
            <select
              id="recurring-plan-category"
              value={form.categoryId}
              onChange={(event) => setField('categoryId', event.target.value)}
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="ln-form-actions">
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => requestLeave(() => navigate('/plan/compromisos'))}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isPending} loadingLabel="Guardando…">
              {plan ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </div>
          {guardDialog}
        </form>
      </Surface>
    </>
  )
}
