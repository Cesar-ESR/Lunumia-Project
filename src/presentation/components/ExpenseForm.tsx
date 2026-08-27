import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { createExpenseSchema } from '@application/contracts'
import type { Category, Expense, Period } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { FormField } from './FormField'
import { Notice } from './Notice'
import { CategorySuggestionPanel } from './CategorySuggestionPanel'
import {
  useCategorySuggestion,
  type SuggestExpenseCategoryAction,
} from '../hooks/useCategorySuggestion'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'

interface ExpenseEditableFormState {
  amount: string
  description: string
  date: string
  categoryId: string
  periodId: string
}

export interface ExpenseFormValue {
  ownerId: string
  periodId: string
  categoryId: string
  amount: number
  description: string
  date: string
  affectsBalance: boolean
}

export interface ExpenseFormInitialValues {
  amount: number | null
  description: string
  date: string
  categoryId: string
  periodId: string
}

export function ExpenseForm({
  ownerId,
  period,
  periods,
  categories,
  initialExpense,
  initialValues,
  currency,
  submitLabel,
  submitDisabled = false,
  resetOnSuccess = true,
  focusOnMount = false,
  idPrefix = 'expense',
  beforeFields,
  categorySuggestionAction = null,
  aiSuggestionEnabled = false,
  aiIdentityKey = ownerId,
  onSubmit,
  onCancel,
}: {
  ownerId: string
  period: Period
  periods?: Period[]
  categories: Category[]
  initialExpense?: Expense
  initialValues?: ExpenseFormInitialValues
  currency?: string
  submitLabel?: string
  submitDisabled?: boolean
  resetOnSuccess?: boolean
  focusOnMount?: boolean
  idPrefix?: string
  beforeFields?:
    | ReactNode
    | ((value: { amountText: string; amountCents: number | null }) => ReactNode)
  categorySuggestionAction?: SuggestExpenseCategoryAction | null
  aiSuggestionEnabled?: boolean
  aiIdentityKey?: string
  onSubmit(value: ExpenseFormValue): Promise<void>
  onCancel?(): void
}) {
  const availablePeriods = periods?.length ? periods : [period]
  const [initialForm] = useState<ExpenseEditableFormState>(() => {
    let initial: ExpenseEditableFormState
    if (initialExpense)
      initial = {
        amount: formatCentsForInput(initialExpense.amount),
        description: initialExpense.description,
        date: initialExpense.date,
        categoryId: initialExpense.categoryId,
        periodId: initialExpense.periodId,
      }
    else if (initialValues)
      initial = {
        amount:
          initialValues.amount === null
            ? ''
            : formatCentsForInput(initialValues.amount),
        description: initialValues.description,
        date: initialValues.date,
        categoryId: initialValues.categoryId,
        periodId: initialValues.periodId,
      }
    else
      initial = {
        amount: '',
        description: '',
        date: getLocalDateOnly(),
        categoryId: '',
        periodId: period.id,
      }
    return initial
  })
  const [form, setForm] = useState<ExpenseEditableFormState>(initialForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [balanceTreatment, setBalanceTreatment] = useState<
    'include' | 'already-included'
  >(
    initialExpense &&
      'affectsBalance' in initialExpense &&
      !initialExpense.affectsBalance
      ? 'already-included'
      : 'include',
  )
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const formElementRef = useRef<HTMLFormElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const submitInProgress = useRef(false)
  const categorySuggestion = useCategorySuggestion({
    action: categorySuggestionAction,
    enabled: aiSuggestionEnabled && !initialExpense,
    identityKey: aiIdentityKey,
    ownerId,
    description: form.description,
    categories,
  })
  const initialBalanceTreatment =
    initialExpense &&
    'affectsBalance' in initialExpense &&
    !initialExpense.affectsBalance
      ? 'already-included'
      : 'include'
  const dirty =
    Object.entries(form).some(
      ([key, value]) =>
        initialForm[key as keyof ExpenseEditableFormState] !== value,
    ) || balanceTreatment !== initialBalanceTreatment
  const { requestLeave, guardDialog } = useUnsavedChangesGuard({
    dirty,
    pending: isPending,
    onDiscard: categorySuggestion.invalidate,
  })

  useEffect(() => {
    if (focusOnMount) descriptionRef.current?.focus()
  }, [focusOnMount])

  useEffect(() => {
    if (!Object.keys(errors).length) return
    formElementRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus()
  }, [errors])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitInProgress.current) return
    const amount = parseMoneyInputToCents(form.amount)
    const input = {
      ownerId,
      periodId: form.periodId,
      categoryId: form.categoryId,
      amount,
      description: form.description,
      date: form.date,
      affectsBalance: balanceTreatment === 'include',
    }
    const parsed = createExpenseSchema.safeParse(input)
    const next = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (amount === null)
      next.amount = 'Escribe un monto positivo con máximo dos decimales.'
    const selectedPeriod = availablePeriods.find(
      (candidate) => candidate.id === form.periodId,
    )
    if (!selectedPeriod)
      next.periodId =
        'No existe un periodo para esta fecha. Crea uno o elige una fecha compatible.'
    else if (
      form.date &&
      (form.date < selectedPeriod.startDate ||
        form.date > selectedPeriod.endDate)
    )
      next.date = 'La fecha debe estar dentro del periodo seleccionado.'
    if (Object.keys(next).length || !parsed.success) {
      setErrors(next)
      return
    }
    setErrors({})
    setServerError(null)
    submitInProgress.current = true
    categorySuggestion.invalidate()
    setIsPending(true)
    try {
      await onSubmit({
        ...parsed.data,
        affectsBalance: balanceTreatment === 'include',
      })
      if (!initialExpense && resetOnSuccess)
        setForm({
          amount: '',
          description: '',
          date: getLocalDateOnly(),
          categoryId: '',
          periodId: period.id,
        })
      if (!initialExpense && resetOnSuccess) setBalanceTreatment('include')
    } catch (reason) {
      setServerError(friendlyError(reason))
    } finally {
      submitInProgress.current = false
      setIsPending(false)
    }
  }

  const selectedPeriod = availablePeriods.find(
    (candidate) => candidate.id === form.periodId,
  )
  const amountId = `${idPrefix}-amount`
  const descriptionId = `${idPrefix}-description`
  const categoryId = `${idPrefix}-category`
  const dateId = `${idPrefix}-date`
  const periodId = `${idPrefix}-period`
  const suggestedCategoryId =
    categorySuggestion.state.status === 'suggestion'
      ? categorySuggestion.state.suggestion.categoryId
      : null

  return (
    <form
      ref={formElementRef}
      className="stack-form"
      onSubmit={submit}
      noValidate
    >
      {serverError ? <Notice tone="error" message={serverError} /> : null}
      {typeof beforeFields === 'function'
        ? beforeFields({
            amountText: form.amount,
            amountCents: parseMoneyInputToCents(form.amount),
          })
        : beforeFields}
      <FormField
        id={amountId}
        label={`Monto${currency ? ` (${currency})` : ''}`}
        error={errors.amount}
      >
        <input
          id={amountId}
          inputMode="decimal"
          placeholder="0.00"
          value={form.amount}
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={errors.amount ? `${amountId}-error` : undefined}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              amount: event.target.value,
            }))
          }
        />
      </FormField>
      <FormField
        id={descriptionId}
        label="Descripción"
        error={errors.description}
      >
        <input
          ref={descriptionRef}
          id={descriptionId}
          maxLength={200}
          value={form.description}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={
            errors.description ? `${descriptionId}-error` : undefined
          }
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </FormField>
      <FormField id={categoryId} label="Categoría" error={errors.categoryId}>
        <select
          id={categoryId}
          value={form.categoryId}
          aria-invalid={Boolean(errors.categoryId)}
          aria-describedby={
            errors.categoryId ? `${categoryId}-error` : undefined
          }
          onChange={(event) => {
            categorySuggestion.suppressCurrent()
            setForm((current) => ({
              ...current,
              categoryId: event.target.value,
            }))
          }}
        >
          <option value="">Selecciona una categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </FormField>
      <CategorySuggestionPanel
        state={categorySuggestion.state}
        categoryName={
          suggestedCategoryId
            ? (categories.find(({ id }) => id === suggestedCategoryId)?.name ??
              null)
            : null
        }
        onUse={() => {
          if (!suggestedCategoryId) return
          setForm((current) => ({
            ...current,
            categoryId: suggestedCategoryId,
          }))
          categorySuggestion.suppressCurrent()
        }}
        onIgnore={categorySuggestion.suppressCurrent}
      />
      <FormField id={dateId} label="Fecha" error={errors.date}>
        <input
          id={dateId}
          type="date"
          min={selectedPeriod?.startDate}
          max={selectedPeriod?.endDate}
          value={form.date}
          aria-invalid={Boolean(errors.date)}
          aria-describedby={errors.date ? `${dateId}-error` : undefined}
          onChange={(event) => {
            const date = event.target.value
            const matchingPeriod = availablePeriods.find(
              (candidate) =>
                candidate.startDate <= date && date <= candidate.endDate,
            )
            setForm((current) => ({
              ...current,
              date,
              periodId: matchingPeriod?.id ?? '',
            }))
          }}
        />
      </FormField>
      {periods ? (
        <FormField
          id={periodId}
          label="Periodo"
          error={errors.periodId}
          hint="Se selecciona automáticamente según la fecha."
        >
          <select
            id={periodId}
            value={form.periodId}
            aria-invalid={Boolean(errors.periodId)}
            aria-describedby={
              errors.periodId ? `${periodId}-error` : `${periodId}-hint`
            }
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                periodId: event.target.value,
              }))
            }
          >
            <option value="">Sin periodo compatible</option>
            {availablePeriods.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.startDate} — {candidate.endDate}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}
      <fieldset className="ln-choice-fieldset ln-balance-question">
        <legend>¿Este gasto ya estaba reflejado en tu saldo actual?</legend>
        <label>
          <input
            type="radio"
            name={`${idPrefix}-balance-treatment`}
            checked={balanceTreatment === 'already-included'}
            onChange={() => setBalanceTreatment('already-included')}
          />
          <span>
            <strong>Sí, sólo agregarlo al historial</strong>
            <small>No volverá a descontarse de tu saldo.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name={`${idPrefix}-balance-treatment`}
            checked={balanceTreatment === 'include'}
            onChange={() => setBalanceTreatment('include')}
          />
          <span>
            <strong>No, descontarlo de mi situación actual</strong>
            <small>Se tratará como un gasto nuevo.</small>
          </span>
        </label>
      </fieldset>
      <div className="form-actions">
        {onCancel ? (
          <button
            type="button"
            className="button ghost"
            disabled={isPending}
            onClick={() => requestLeave(onCancel)}
          >
            Cancelar
          </button>
        ) : null}
        <button className="button" disabled={isPending || submitDisabled}>
          {isPending
            ? 'Guardando…'
            : (submitLabel ??
              (initialExpense ? 'Guardar cambios' : 'Agregar gasto'))}
        </button>
      </div>
      {guardDialog}
    </form>
  )
}
