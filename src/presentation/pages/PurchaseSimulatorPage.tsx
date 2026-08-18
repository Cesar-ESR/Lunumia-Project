import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createExpenseSchema } from '@application/contracts'
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
import { parseMoneyInputToCents } from '../utils/money-input'

export function PurchaseSimulatorPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showConversion, setShowConversion] = useState(false)
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(getLocalDateOnly())
  const [errors, setErrors] = useState<FieldErrors>({})
  const [confirming, setConfirming] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const amount = parseMoneyInputToCents(amountText)
  const load = useCallback(async () => {
    const categories = await services.categories.listCategories.execute()
    if (!activePeriod || amount === null || !categoryId)
      return { categories, result: null }
    const result = await services.simulator.simulatePurchase.execute({
      period: activePeriod,
      categoryId,
      amount,
    })
    return { categories, result }
  }, [activePeriod, amount, categoryId, services])
  const simulation = useAsyncData(load)

  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Decisión"
          title="Simulador de compra"
          description="Prueba el impacto de una compra sin guardar nada."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo para calcular tu dinero disponible."
          action={
            <Link className="button" to="/periods">
              Administrar periodos
            </Link>
          }
        />
      </>
    )

  const amountError =
    amountText && amount === null
      ? 'Escribe un monto positivo con máximo dos decimales.'
      : undefined
  const prepareConversion = () => {
    const next: FieldErrors = {}
    if (amount === null) next.amount = 'Escribe un monto válido.'
    if (!categoryId) next.categoryId = 'Selecciona una categoría.'
    setErrors(next)
    if (!Object.keys(next).length) setShowConversion(true)
  }
  const requestConversion = (event: FormEvent) => {
    event.preventDefault()
    const input = {
      ownerId: services.ownerId,
      periodId: activePeriod.id,
      categoryId,
      amount,
      description,
      date,
    }
    const parsed = createExpenseSchema.safeParse(input)
    const next = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (date && (date < activePeriod.startDate || date > activePeriod.endDate))
      next.date = 'La fecha debe estar dentro del periodo activo.'
    if (Object.keys(next).length || !parsed.success) {
      setErrors(next)
      return
    }
    setErrors({})
    setConfirming(true)
  }
  const confirmConversion = async () => {
    const input = {
      ownerId: services.ownerId,
      periodId: activePeriod.id,
      categoryId,
      amount,
      description,
      date,
    }
    const parsed = createExpenseSchema.safeParse(input)
    if (!parsed.success) {
      setConfirming(false)
      setErrors(zodFieldErrors(parsed.error))
      return
    }
    setIsPending(true)
    try {
      await services.expenses.createExpense.execute(parsed.data)
      setConfirming(false)
      setShowConversion(false)
      setAmountText('')
      setCategoryId('')
      setDescription('')
      setNotice({
        tone: 'success',
        message: 'La simulación se convirtió en gasto.',
      })
    } catch (reason) {
      setConfirming(false)
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }
  const result = amount !== null && categoryId ? simulation.data?.result : null
  return (
    <>
      <PageHeader
        eyebrow="Decisión"
        title="Simulador de compra"
        description="Explora el impacto antes de comprometer tu dinero."
      />
      {notice ? <Notice {...notice} /> : null}
      <div className="split-layout simulator-layout">
        <section className="panel">
          <h2>¿Qué quieres comprar?</h2>
          <div className="stack-form">
            <FormField
              id="simulation-amount"
              label="Monto de la compra"
              error={errors.amount || amountError}
            >
              <input
                id="simulation-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amountText}
                aria-describedby={
                  errors.amount || amountError
                    ? 'simulation-amount-error'
                    : undefined
                }
                onChange={(event) => {
                  setAmountText(event.target.value)
                  setErrors({ ...errors, amount: '' })
                  setShowConversion(false)
                }}
              />
            </FormField>
            <FormField
              id="simulation-category"
              label="Categoría"
              error={errors.categoryId}
            >
              <select
                id="simulation-category"
                value={categoryId}
                aria-describedby={
                  errors.categoryId ? 'simulation-category-error' : undefined
                }
                onChange={(event) => {
                  setCategoryId(event.target.value)
                  setErrors({ ...errors, categoryId: '' })
                  setShowConversion(false)
                }}
              >
                <option value="">Selecciona una categoría</option>
                {simulation.data?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </section>
        <section
          className={`panel simulation-result ${result?.financialAffordability === 'exceeds' ? 'negative-result' : ''}`}
          aria-live="polite"
        >
          <h2>Resultado</h2>
          {simulation.status === 'loading' && amount !== null && categoryId ? (
            <LoadingState message="Calculando impacto…" />
          ) : null}
          {simulation.status === 'error' ? (
            <ErrorState
              message={simulation.error.message}
              onRetry={simulation.refresh}
            />
          ) : null}
          {!result ? (
            <EmptyState
              title="Completa la simulación"
              description="Escribe un monto válido y elige una categoría para ver el resultado."
            />
          ) : (
            <>
              <div className="simulation-grid">
                <div>
                  <span>Disponible proyectado actual</span>
                  {result.projectedAvailableBeforePurchase === null ? (
                    <strong>No configurado</strong>
                  ) : (
                    <MoneyDisplay
                      amount={result.projectedAvailableBeforePurchase}
                    />
                  )}
                </div>
                <div>
                  <span>Disponible después</span>
                  {result.projectedAvailableAfterPurchase === null ? (
                    <strong>No evaluable</strong>
                  ) : (
                    <MoneyDisplay
                      amount={result.projectedAvailableAfterPurchase}
                    />
                  )}
                </div>
                <div>
                  <span>Presupuesto antes</span>
                  {result.categoryBudgetBefore === null ? (
                    <strong>Sin presupuesto</strong>
                  ) : (
                    <MoneyDisplay amount={result.categoryBudgetBefore} />
                  )}
                </div>
                <div>
                  <span>Presupuesto después</span>
                  {result.categoryBudgetAfter === null ? (
                    <strong>No aplica</strong>
                  ) : (
                    <MoneyDisplay amount={result.categoryBudgetAfter} />
                  )}
                </div>
              </div>
              <p className="simulation-message">
                {result.financialAffordability === 'unknown'
                  ? 'Configura tu saldo para evaluar si esta compra cabe en tu dinero disponible.'
                  : result.financialAffordability === 'exceeds'
                    ? 'Esta compra dejaría tu dinero disponible en negativo.'
                    : 'Esta compra se mantiene dentro de tu dinero disponible actual.'}
              </p>
              {result.projectionCoverage === 'overdue_only' ? (
                <p>La proyección sólo considera compromisos vencidos.</p>
              ) : null}
              <button
                type="button"
                className="button"
                onClick={prepareConversion}
              >
                Convertir en gasto
              </button>
            </>
          )}
        </section>
      </div>
      {showConversion ? (
        <section className="panel conversion-panel">
          <h2>Datos del gasto</h2>
          <form className="form-grid" onSubmit={requestConversion} noValidate>
            <FormField
              id="conversion-description"
              label="Descripción"
              error={errors.description}
            >
              <input
                id="conversion-description"
                maxLength={200}
                value={description}
                aria-describedby={
                  errors.description
                    ? 'conversion-description-error'
                    : undefined
                }
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            <FormField id="conversion-date" label="Fecha" error={errors.date}>
              <input
                id="conversion-date"
                type="date"
                min={activePeriod.startDate}
                max={activePeriod.endDate}
                value={date}
                aria-describedby={
                  errors.date ? 'conversion-date-error' : undefined
                }
                onChange={(event) => setDate(event.target.value)}
              />
            </FormField>
            <div className="form-actions full-row">
              <button
                type="button"
                className="button ghost"
                onClick={() => setShowConversion(false)}
              >
                Cancelar
              </button>
              <button className="button">Revisar gasto</button>
            </div>
          </form>
        </section>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Convertir simulación en gasto"
        description="Esta acción guardará un gasto real en el periodo activo. La simulación por sí sola no guarda datos."
        confirmLabel="Guardar gasto"
        isPending={isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmConversion()}
      />
    </>
  )
}
