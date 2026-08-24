import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createIncomeSchema } from '@application/contracts'
import { getLocalDateOnly } from '@shared/utils/date'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/Button'
import { FormField } from '../components/FormField'
import { MoneyField } from '../components/MoneyField'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'
import { parseMoneyInputToCents } from '../utils/money-input'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'

type IncomeIntention = 'received' | 'expected'
type BalanceTreatment = 'include' | 'already-included'

function dateWithinPeriod(date: string, startDate: string, endDate: string) {
  if (date < startDate) return startDate
  if (date > endDate) return endDate
  return date
}

export function IncomeCreatePage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultIntention: IncomeIntention =
    searchParams.get('modo') === 'esperado' ? 'expected' : 'received'
  const today = getLocalDateOnly()
  const initialDate = activePeriod
    ? dateWithinPeriod(today, activePeriod.startDate, activePeriod.endDate)
    : today
  const [intention, setIntention] = useState(defaultIntention)
  const [balanceTreatment, setBalanceTreatment] =
    useState<BalanceTreatment>('include')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(initialDate)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty =
    amount !== '' ||
    description !== '' ||
    date !== initialDate ||
    intention !== defaultIntention ||
    balanceTreatment !== 'include'
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

  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Movimientos"
          title="Registrar ingreso"
          description="Elige si el dinero ya llegó o todavía lo esperas."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo antes de registrar un ingreso."
          action={
            <Link className="ln-button ln-button--primary" to="/plan/periodos">
              Administrar periodos
            </Link>
          }
        />
      </>
    )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amountCents = parseMoneyInputToCents(amount)
    const input = {
      ownerId: services.ownerId,
      periodId: activePeriod.id,
      amount: amountCents,
      description,
      date,
      ...(intention === 'received'
        ? { affectsBalance: balanceTreatment === 'include' }
        : {}),
    }
    const parsed = createIncomeSchema.safeParse(input)
    const next = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (amountCents === null)
      next.amount = 'Escribe un monto positivo con máximo dos decimales.'
    if (date && (date < activePeriod.startDate || date > activePeriod.endDate))
      next.date = 'La fecha debe estar dentro del periodo activo.'
    if (Object.keys(next).length || !parsed.success) {
      setErrors(next)
      return
    }
    setErrors({})
    setServerError(null)
    setIsPending(true)
    try {
      if (intention === 'expected')
        await services.incomes.createExpectedIncome.execute(parsed.data)
      else await services.incomes.createIncome.execute(parsed.data)
      const expected = intention === 'expected'
      navigate(
        `/movimientos?tipo=ingresos&estado=${expected ? 'esperados' : 'recibidos'}`,
        {
          replace: true,
          state: {
            movementNotice: expected
              ? 'Ingreso esperado guardado. Todavía no forma parte de tu saldo.'
              : 'Ingreso recibido guardado.',
          },
        },
      )
    } catch (reason) {
      setServerError(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Movimientos"
        title="Registrar ingreso"
        description="Distingue entre dinero disponible y dinero que esperas recibir."
      />
      <Surface className="ln-income-form-surface">
        <form
          ref={formRef}
          className="ln-income-form"
          onSubmit={submit}
          noValidate
        >
          {serverError ? <Notice tone="error" message={serverError} /> : null}
          {Object.keys(errors).length ? (
            <div className="ln-error-summary" role="alert">
              <strong>Revisa los campos marcados.</strong>
            </div>
          ) : null}
          <fieldset className="ln-choice-fieldset">
            <legend>¿Este ingreso ya llegó?</legend>
            <div className="ln-segmented-choice">
              <label>
                <input
                  type="radio"
                  name="income-intention"
                  value="received"
                  checked={intention === 'received'}
                  onChange={() => setIntention('received')}
                />
                <span>Ya lo recibí</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="income-intention"
                  value="expected"
                  checked={intention === 'expected'}
                  onChange={() => setIntention('expected')}
                />
                <span>Espero recibirlo</span>
              </label>
            </div>
          </fieldset>

          <Notice
            tone={intention === 'expected' ? 'info' : 'success'}
            message={
              intention === 'expected'
                ? 'Todavía no forma parte de tu saldo.'
                : balanceTreatment === 'include'
                  ? 'Se incluirá en tu situación actual.'
                  : 'Se agregará al historial sin volver a sumarlo a tu saldo.'
            }
          />

          <MoneyField
            id="income-amount"
            label="Monto"
            value={amount}
            error={errors.amount}
            required
            onChange={(event) => setAmount(event.target.value)}
          />
          <FormField
            id="income-description"
            label="Descripción u origen"
            error={errors.description}
            required
          >
            <input
              id="income-description"
              maxLength={200}
              value={description}
              required
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? 'income-description-error' : undefined
              }
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <FormField
            id="income-date"
            label={
              intention === 'expected'
                ? 'Fecha esperada'
                : 'Fecha en que lo recibiste'
            }
            error={errors.date}
            hint={`${activePeriod.startDate} — ${activePeriod.endDate}`}
            required
          >
            <input
              id="income-date"
              type="date"
              min={activePeriod.startDate}
              max={activePeriod.endDate}
              value={date}
              required
              aria-invalid={Boolean(errors.date)}
              aria-describedby={
                errors.date ? 'income-date-error' : 'income-date-hint'
              }
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>

          {intention === 'received' ? (
            <fieldset className="ln-choice-fieldset ln-balance-question">
              <legend>
                ¿Este ingreso ya estaba incluido en el saldo actual que
                indicaste?
              </legend>
              <label>
                <input
                  type="radio"
                  name="balance-treatment"
                  checked={balanceTreatment === 'already-included'}
                  onChange={() => setBalanceTreatment('already-included')}
                />
                <span>
                  <strong>Sí, sólo agregarlo al historial</strong>
                  <small>No volverá a sumarse a tu saldo.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="balance-treatment"
                  checked={balanceTreatment === 'include'}
                  onChange={() => setBalanceTreatment('include')}
                />
                <span>
                  <strong>No, incluirlo en mi situación actual</strong>
                  <small>Se tratará como dinero recibido ahora.</small>
                </span>
              </label>
            </fieldset>
          ) : null}

          <div className="ln-form-actions">
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => requestLeave(() => navigate('/movimientos'))}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isPending} loadingLabel="Guardando…">
              {intention === 'expected'
                ? 'Guardar ingreso esperado'
                : 'Guardar ingreso recibido'}
            </Button>
          </div>
          {guardDialog}
        </form>
      </Surface>
    </>
  )
}
