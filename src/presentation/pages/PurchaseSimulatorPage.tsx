import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, CircleAlert, WalletCards } from 'lucide-react'
import type { ApplicationServices } from '../../app/composition-root'
import { createExpenseSchema } from '@application/contracts'
import { getLocalDateOnly } from '@shared/utils/date'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { MetricBlock } from '../components/MetricBlock'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { MoneyField } from '../components/MoneyField'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'
import { parseMoneyInputToCents } from '../utils/money-input'
import { projectionMetricState } from '../utils/projection-view-model'

type PurchaseSimulation = Awaited<
  ReturnType<ApplicationServices['simulator']['simulatePurchase']['execute']>
>

type ResultState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: PurchaseSimulation; error: null }
  | { status: 'error'; data: null; error: Error }

const idleResult: ResultState = { status: 'idle', data: null, error: null }

export function PurchaseSimulatorPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const loadCategories = useCallback(
    () => services.categories.listCategories.execute(),
    [services],
  )
  const categories = useAsyncData(loadCategories)
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [result, setResult] = useState<ResultState>(idleResult)
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

  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Herramientas"
          title="Simulador de compra"
          description="Evalúa una compra hipotética sin guardar nada."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo seleccionado para ejecutar la simulación."
          action={
            <Link className="ln-button ln-button--primary" to="/plan/periodos">
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

  const clearResult = () => {
    setResult(idleResult)
    setShowConversion(false)
  }

  const simulate = async (event: FormEvent) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (amount === null) next.amount = 'Escribe un monto válido.'
    if (!categoryId) next.categoryId = 'Selecciona una categoría.'
    setErrors(next)
    setShowConversion(false)
    if (Object.keys(next).length || amount === null) return
    setResult({ status: 'loading', data: null, error: null })
    try {
      const data = await services.simulator.simulatePurchase.execute({
        period: activePeriod,
        categoryId,
        amount,
      })
      setResult({ status: 'success', data, error: null })
    } catch (reason) {
      setResult({
        status: 'error',
        data: null,
        error:
          reason instanceof Error
            ? reason
            : new Error('No fue posible ejecutar la simulación.'),
      })
    }
  }

  const prepareConversion = () => {
    if (result.status !== 'success') return
    setErrors({})
    setShowConversion(true)
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
      next.date = 'La fecha debe estar dentro del periodo seleccionado.'
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
      setResult(idleResult)
      setNotice({
        tone: 'success',
        message: 'La compra revisada se guardó como gasto.',
      })
    } catch (reason) {
      setConfirming(false)
      setNotice({ tone: 'error', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Herramientas"
        title="Simulador de compra"
        description="Evalúa una compra hipotética con el resultado autoritativo de Lunumia. La simulación no guarda datos."
      />
      {notice ? <Notice {...notice} /> : null}
      <div className="ln-simulator-layout">
        <Surface
          className="ln-simulator-form"
          aria-labelledby="simulator-form-title"
        >
          <div className="ln-simulator-heading">
            <Calculator aria-hidden="true" />
            <div>
              <p className="eyebrow">Compra hipotética</p>
              <h2 id="simulator-form-title">Datos de la simulación</h2>
            </div>
          </div>
          {Object.keys(errors).length && !showConversion ? (
            <Notice
              tone="error"
              title="Revisa la simulación"
              message="Corrige los campos indicados antes de continuar."
            />
          ) : null}
          <form
            className="stack-form"
            onSubmit={(event) => void simulate(event)}
            noValidate
          >
            <MoneyField
              id="simulation-amount"
              label="Monto de la compra"
              value={amountText}
              error={amountError || errors.amount}
              required
              onChange={(event) => {
                setAmountText(event.target.value)
                setErrors({ ...errors, amount: '' })
                clearResult()
              }}
            />
            <FormField
              id="simulation-category"
              label="Categoría"
              error={errors.categoryId}
              required
            >
              <select
                id="simulation-category"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value)
                  setErrors({ ...errors, categoryId: '' })
                  clearResult()
                }}
              >
                <option value="">Selecciona una categoría</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
            {categories.status === 'loading' && !categories.data ? (
              <LoadingState message="Cargando categorías…" />
            ) : null}
            {categories.status === 'error' ? (
              <ErrorState
                title="No pudimos cargar las categorías"
                message={categories.error.message}
                onRetry={categories.refresh}
              />
            ) : null}
            <Button
              type="submit"
              loading={result.status === 'loading'}
              loadingLabel="Simulando…"
              disabled={categories.status === 'error'}
            >
              Simular compra
            </Button>
          </form>
        </Surface>

        <Surface
          className={`ln-simulator-result ${result.status === 'success' ? `ln-simulator-result--${result.data.financialAffordability}` : ''}`}
          aria-labelledby="simulation-result-title"
          aria-live="polite"
          aria-busy={result.status === 'loading'}
          role="status"
        >
          <h2 id="simulation-result-title">Resultado</h2>
          {result.status === 'idle' ? (
            <EmptyState
              title="Aún no hay una simulación"
              description="Completa los datos y elige “Simular compra”."
            />
          ) : null}
          {result.status === 'loading' ? (
            <LoadingState message="Evaluando la compra hipotética…" />
          ) : null}
          {result.status === 'error' ? (
            <ErrorState
              title="No pudimos ejecutar la simulación"
              message={result.error.message}
            />
          ) : null}
          {result.status === 'success' ? (
            <SimulationResult
              result={result.data}
              onConvert={prepareConversion}
            />
          ) : null}
        </Surface>
      </div>

      {showConversion ? (
        <Surface
          className="ln-simulator-conversion"
          aria-labelledby="conversion-title"
        >
          <h2 id="conversion-title">Revisar datos del gasto</h2>
          <p>
            Esta etapa prepara un gasto, pero todavía no modifica tus datos.
          </p>
          {Object.keys(errors).length ? (
            <Notice
              tone="error"
              title="Revisa el gasto"
              message="Corrige los campos indicados antes de abrir la confirmación."
            />
          ) : null}
          <form className="form-grid" onSubmit={requestConversion} noValidate>
            <FormField
              id="conversion-description"
              label="Descripción"
              error={errors.description}
              required
            >
              <input
                id="conversion-description"
                maxLength={200}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            <FormField
              id="conversion-date"
              label="Fecha"
              error={errors.date}
              required
            >
              <input
                id="conversion-date"
                type="date"
                min={activePeriod.startDate}
                max={activePeriod.endDate}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </FormField>
            <div className="ln-form-actions full-row">
              <Button
                variant="secondary"
                onClick={() => setShowConversion(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Revisar y confirmar</Button>
            </div>
          </form>
        </Surface>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Guardar compra como gasto"
        description="Esta confirmación sí guardará un gasto real en el periodo seleccionado. La simulación por sí sola no modifica datos."
        confirmLabel="Guardar gasto"
        isPending={isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmConversion()}
      />
    </>
  )
}

function SimulationResult({
  result,
  onConvert,
}: {
  result: PurchaseSimulation
  onConvert(): void
}) {
  const financialCopy = {
    within: 'Dentro de tu disponible.',
    exceeds: 'Dejaría tu disponible en negativo.',
    unknown: 'No podemos evaluarla hasta conocer tu saldo.',
  }[result.financialAffordability]
  const budgetCopy = {
    within: 'Dentro del presupuesto disponible de la categoría.',
    exceeds: 'Supera el presupuesto disponible de la categoría.',
    not_configured: 'No hay un presupuesto configurado para esta categoría.',
  }[result.budgetFit]

  return (
    <div className="ln-simulator-result-content">
      <div className="ln-simulator-verdict">
        <CircleAlert aria-hidden="true" />
        <strong>{financialCopy}</strong>
      </div>
      <div className="ln-simulator-metrics">
        <MetricBlock
          label="Disponible proyectado actual"
          value={
            result.projectedAvailableBeforePurchase === null ? (
              'No calculable'
            ) : (
              <MoneyDisplay amount={result.projectedAvailableBeforePurchase} />
            )
          }
          state={projectionMetricState(result.projectedAvailableBeforePurchase)}
        />
        <MetricBlock
          variant="primary"
          label="Disponible después de la compra"
          value={
            result.projectedAvailableAfterPurchase === null ? (
              'No calculable'
            ) : (
              <MoneyDisplay amount={result.projectedAvailableAfterPurchase} />
            )
          }
          state={projectionMetricState(result.projectedAvailableAfterPurchase)}
        />
        <MetricBlock
          label="Presupuesto antes"
          value={
            result.categoryBudgetBefore === null ? (
              'Sin presupuesto'
            ) : (
              <MoneyDisplay amount={result.categoryBudgetBefore} />
            )
          }
          state={projectionMetricState(result.categoryBudgetBefore)}
        />
        <MetricBlock
          label="Presupuesto después"
          value={
            result.categoryBudgetAfter === null ? (
              'No aplica'
            ) : (
              <MoneyDisplay amount={result.categoryBudgetAfter} />
            )
          }
          state={projectionMetricState(result.categoryBudgetAfter)}
        />
      </div>
      <p className="ln-simulator-budget-copy">
        <WalletCards aria-hidden="true" /> {budgetCopy}
      </p>
      {result.projectionCoverage === 'overdue_only' ? (
        <p>La proyección disponible sólo cubre compromisos vencidos.</p>
      ) : null}
      {result.financialAffordability === 'unknown' ? (
        <Link className="ln-button ln-button--secondary" to="/saldo/inicial">
          Indicar saldo actual
        </Link>
      ) : null}
      <Button onClick={onConvert}>Convertir en gasto</Button>
    </div>
  )
}
