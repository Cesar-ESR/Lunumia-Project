import { useCallback, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  CircleSlash,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { Expense, RecurringPaymentOccurrence } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { MoneyField } from '../components/MoneyField'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError } from '../utils/forms'
import { formatCompactDate } from '../utils/movement-view-model'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'
import { occurrenceToViewModel } from '../utils/recurring-occurrence-view-model'

type DetailAction = 'pay' | 'skip' | 'reverse' | null

export function CommitmentDetailPage() {
  const { id = '' } = useParams()
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    if (!activePeriod) return null
    const [overview, categories, expenses] = await Promise.all([
      services.recurringPayments.getOverview.execute(activePeriod.id),
      services.categories.listCategories.execute(),
      services.expenses.listExpensesByPeriod.execute(activePeriod.id),
    ])
    const occurrence = overview.occurrences.find((item) => item.id === id)
    if (!occurrence) return null
    const payment = overview.payments.find(
      (item) => item.id === occurrence.recurringPaymentId,
    )
    const category = categories.find((item) => item.id === payment?.categoryId)
    const expense = expenses.find(
      (item) => item.recurringOccurrenceId === occurrence.id,
    )
    return { occurrence, payment, category, expense }
  }, [activePeriod, id, services])
  const data = useAsyncData(load)

  if (data.status === 'loading' && !data.data)
    return <LoadingState message="Cargando compromiso…" />
  if (data.status === 'error')
    return (
      <ErrorState
        message="No pudimos cargar este compromiso."
        onRetry={data.refresh}
      />
    )
  if (!activePeriod || !data.data)
    return (
      <ErrorState
        title="Compromiso no disponible"
        message="No existe en el periodo activo. Selecciona el periodo que contiene esta ocurrencia."
      />
    )

  return (
    <CommitmentDetail
      key={data.data.occurrence.id}
      initialOccurrence={data.data.occurrence}
      initialExpense={data.data.expense}
      payment={data.data.payment}
      category={data.data.category}
      period={activePeriod}
    />
  )
}

function CommitmentDetail({
  initialOccurrence,
  initialExpense,
  payment,
  category,
  period,
}: {
  initialOccurrence: RecurringPaymentOccurrence
  initialExpense: Expense | undefined
  payment: Parameters<typeof occurrenceToViewModel>[0]['payment']
  category: Parameters<typeof occurrenceToViewModel>[0]['category']
  period: { id: string; startDate: string; endDate: string }
}) {
  const services = useApplicationServices()
  const [occurrence, setOccurrence] = useState(initialOccurrence)
  const [expense, setExpense] = useState<Expense | undefined>(initialExpense)
  const [action, setAction] = useState<DetailAction>(null)
  const [isPending, setIsPending] = useState(false)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const today = getLocalDateOnly()
  const initialPaidDate =
    period.startDate <= today && today <= period.endDate
      ? today
      : occurrence.dueDate
  const plannedAmount = 'amount' in occurrence ? occurrence.amount : null
  const [paidDate, setPaidDate] = useState(initialPaidDate)
  const [actualAmount, setActualAmount] = useState(
    plannedAmount === null ? '' : formatCentsForInput(plannedAmount),
  )
  const [fieldError, setFieldError] = useState<string | null>(null)
  const statusHeadingRef = useRef<HTMLHeadingElement>(null)
  const shouldFocusStatusOnCloseRef = useRef(false)
  const viewModel = occurrenceToViewModel({
    occurrence,
    payment,
    category,
    linkedExpense: expense,
    today,
  })

  const getPostCloseFocusTarget = useCallback(() => {
    if (!shouldFocusStatusOnCloseRef.current) return null
    shouldFocusStatusOnCloseRef.current = false
    return statusHeadingRef.current
  }, [])

  const openAction = (nextAction: Exclude<DetailAction, null>) => {
    shouldFocusStatusOnCloseRef.current = false
    setAction(nextAction)
  }

  const closeAction = () => {
    shouldFocusStatusOnCloseRef.current = false
    setAction(null)
  }

  const confirm = async () => {
    if (!action) return
    if (action === 'pay') {
      const actualAmountCents = parseMoneyInputToCents(actualAmount)
      if (actualAmountCents === null) {
        setFieldError('Escribe un monto positivo con máximo dos decimales.')
        return
      }
      if (
        !paidDate ||
        paidDate < period.startDate ||
        paidDate > period.endDate
      ) {
        setFieldError('La fecha de pago debe estar dentro del periodo activo.')
        return
      }
    }

    setFieldError(null)
    setNotice(null)
    setIsPending(true)
    try {
      if (action === 'pay') {
        const actualAmountCents = parseMoneyInputToCents(actualAmount)!
        const result =
          await services.recurringPayments.markOccurrenceAsPaid.execute({
            ownerId: services.ownerId,
            occurrenceId: occurrence.id,
            paidDate,
            ...(actualAmountCents === plannedAmount
              ? {}
              : { actualAmountCents }),
          })
        setOccurrence(result.occurrence)
        setExpense(result.expense)
        setNotice({
          tone: 'success',
          message: 'Pago registrado. Se creó el gasto vinculado.',
        })
      } else if (action === 'skip') {
        const result =
          await services.recurringPayments.markOccurrenceAsSkipped.execute(
            period.id,
            occurrence.id,
          )
        setOccurrence(result)
        setNotice({
          tone: 'success',
          message: 'Ocurrencia omitida. El plan continuará.',
        })
      } else if (expense) {
        await services.expenses.deleteExpense.execute(expense.id)
        setOccurrence({ ...occurrence, status: 'pending', transactionId: null })
        setExpense(undefined)
        setNotice({
          tone: 'success',
          message: 'Pago deshecho. El compromiso volvió a pendiente.',
        })
      }
      shouldFocusStatusOnCloseRef.current = true
      setAction(null)
    } catch (reason) {
      closeAction()
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }

  const isPendingOccurrence = occurrence.status === 'pending'
  return (
    <>
      <Link className="ln-back-link" to="/plan/compromisos">
        <ArrowLeft aria-hidden="true" /> Volver a Compromisos
      </Link>
      <PageHeader
        eyebrow="Ocurrencia"
        title={viewModel.planName}
        description={`Vencimiento ${formatCompactDate(viewModel.dueDate)}`}
      />
      {notice ? <Notice {...notice} /> : null}
      {viewModel.amountUnavailable ? (
        <Notice
          tone="warning"
          title="Monto histórico no disponible"
          message="Esta ocurrencia fue creada con un formato anterior. No usamos el monto actual del plan para reemplazar su historial."
        />
      ) : null}

      <Surface className="ln-commitment-detail">
        <div className="ln-commitment-detail__status">
          <span
            className={`ln-status-icon ln-status-icon--${viewModel.status}`}
          >
            {viewModel.status === 'paid' ? (
              <CircleCheck aria-hidden="true" />
            ) : viewModel.status === 'skipped' ? (
              <CircleSlash aria-hidden="true" />
            ) : (
              <CalendarClock aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="eyebrow">Estado actual</p>
            <h2 ref={statusHeadingRef} tabIndex={-1}>
              {viewModel.statusLabel}
            </h2>
            <p>{viewModel.dateContext}</p>
          </div>
        </div>
        <dl className="ln-detail-list">
          <div>
            <dt>Monto de esta ocurrencia</dt>
            <dd>
              {plannedAmount === null ? (
                'No disponible'
              ) : (
                <MoneyDisplay amount={plannedAmount} />
              )}
            </dd>
          </div>
          <div>
            <dt>Categoría</dt>
            <dd>{viewModel.categoryName}</dd>
          </div>
          <div>
            <dt>Fecha de vencimiento</dt>
            <dd>{formatCompactDate(viewModel.dueDate)}</dd>
          </div>
          {expense ? (
            <>
              <div>
                <dt>Monto pagado</dt>
                <dd>
                  <MoneyDisplay amount={expense.amount} />
                </dd>
              </div>
              <div>
                <dt>Fecha de pago</dt>
                <dd>{formatCompactDate(expense.date)}</dd>
              </div>
              <div>
                <dt>Gasto vinculado</dt>
                <dd>
                  <Link to="/movimientos?tipo=gastos">Ver en Movimientos</Link>
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        <div className="ln-detail-actions">
          {isPendingOccurrence && plannedAmount !== null ? (
            <button
              type="button"
              className="ln-button ln-button--primary"
              onClick={() => openAction('pay')}
            >
              Registrar pago
            </button>
          ) : null}
          {isPendingOccurrence ? (
            <button
              type="button"
              className="ln-button ln-button--secondary"
              onClick={() => openAction('skip')}
            >
              Omitir esta ocurrencia
            </button>
          ) : null}
          {occurrence.status === 'paid' && expense ? (
            <button
              type="button"
              className="ln-button ln-button--danger"
              onClick={() => openAction('reverse')}
            >
              Deshacer pago
            </button>
          ) : null}
        </div>
      </Surface>

      <ConfirmDialog
        open={action === 'pay'}
        title="Registrar este pago"
        description="Confirma cómo ocurrió el pago. Se registrará un gasto y este compromiso quedará como pagado."
        confirmLabel="Registrar pago"
        destructive={false}
        isPending={isPending}
        getPostCloseFocusTarget={getPostCloseFocusTarget}
        onCancel={() => {
          closeAction()
          setFieldError(null)
        }}
        onConfirm={() => void confirm()}
      >
        <div className="ln-payment-dialog-fields">
          <p>
            <strong>{viewModel.planName}</strong>
          </p>
          <p>
            Planeado:{' '}
            {plannedAmount === null ? (
              'No disponible'
            ) : (
              <MoneyDisplay amount={plannedAmount} />
            )}
          </p>
          <p>Vencimiento: {formatCompactDate(viewModel.dueDate)}</p>
          <p>Categoría: {viewModel.categoryName}</p>
          <MoneyField
            id="occurrence-actual-amount"
            label="Monto pagado"
            value={actualAmount}
            error={fieldError?.startsWith('Escribe') ? fieldError : undefined}
            required
            onChange={(event) => {
              setActualAmount(event.target.value)
              setFieldError(null)
            }}
          />
          <FormField
            id="occurrence-paid-date"
            label="Fecha de pago"
            hint={`${period.startDate} — ${period.endDate}`}
            error={fieldError?.startsWith('La fecha') ? fieldError : undefined}
            required
          >
            <input
              id="occurrence-paid-date"
              type="date"
              min={period.startDate}
              max={period.endDate}
              value={paidDate}
              onChange={(event) => {
                setPaidDate(event.target.value)
                setFieldError(null)
              }}
            />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={action === 'skip'}
        title="Omitir esta ocurrencia"
        description="El plan continuará. Sólo se omitirá este pago. Esta decisión no se puede deshacer desde aquí."
        confirmLabel="Omitir ocurrencia"
        isPending={isPending}
        getPostCloseFocusTarget={getPostCloseFocusTarget}
        onCancel={closeAction}
        onConfirm={() => void confirm()}
      />
      <ConfirmDialog
        open={action === 'reverse'}
        title="Deshacer pago"
        description="Se eliminará el gasto vinculado y este compromiso volverá a pendiente. El plan recurrente no cambiará."
        confirmLabel="Deshacer pago"
        isPending={isPending}
        getPostCloseFocusTarget={getPostCloseFocusTarget}
        onCancel={closeAction}
        onConfirm={() => void confirm()}
      >
        <div className="ln-payment-dialog-fields">
          <p>
            <strong>{viewModel.planName}</strong>
          </p>
          <p>
            Monto pagado:{' '}
            {expense ? (
              <MoneyDisplay amount={expense.amount} />
            ) : (
              'No disponible'
            )}
          </p>
          <p>
            Fecha de pago:{' '}
            {expense ? formatCompactDate(expense.date) : 'No disponible'}
          </p>
        </div>
      </ConfirmDialog>
    </>
  )
}
