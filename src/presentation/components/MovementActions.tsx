import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { EllipsisVertical } from 'lucide-react'
import type { Category, Expense, Income } from '@domain/entities'
import { createExpenseSchema, createIncomeSchema } from '@application/contracts'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { FormField } from './FormField'
import { Notice } from './Notice'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'
import { zodFieldErrors, type FieldErrors } from '../utils/forms'

type Movement = Income | Expense

export function MovementActions({
  movement,
  categories,
  onChanged,
}: {
  movement: Movement
  categories: Category[]
  onChanged(): void
}) {
  const services = useApplicationServices()
  const trigger = useRef<HTMLButtonElement>(null)
  const changed = useRef(false)
  const [mode, setMode] = useState<'actions' | 'edit' | 'delete' | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [error, setError] = useState<string | null>(null)
  // When changing sheets, restore into the new dialog rather than its inert trigger.
  const restoreFocus = useCallback(
    () =>
      (changed.current ? document.querySelector<HTMLElement>('main') : null) ??
      document.querySelector<HTMLElement>(
        '[role="dialog"] input, [role="dialog"] button',
      ) ??
      trigger.current,
    [],
  )
  const expense = 'categoryId' in movement
  const close = () => {
    if (!busy.current) {
      setMode(null)
      setError(null)
    }
  }
  const remove = async () => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    try {
      if (expense) await services.expenses.deleteExpense.execute(movement.id)
      else await services.incomes.deleteIncome.execute(movement.id)
      changed.current = true
      setMode(null)
      onChanged()
    } catch {
      setError('No pudimos eliminar el movimiento. Inténtalo de nuevo.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ln-row-link"
        aria-label={`Acciones de ${movement.description}`}
        aria-haspopup="dialog"
        onClick={() => {
          changed.current = false
          setMode('actions')
        }}
      >
        <EllipsisVertical aria-hidden="true" />
      </button>
      <Dialog
        open={mode === 'actions'}
        title="Acciones del movimiento"
        description={movement.description}
        onClose={close}
        getPostCloseFocusTarget={restoreFocus}
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button onClick={() => setMode('edit')}>Editar</Button>
            <Button variant="danger" onClick={() => setMode('delete')}>
              Eliminar
            </Button>
          </>
        }
      />
      {mode === 'edit' ? (
        <MovementEditor
          movement={movement}
          categories={categories}
          onClose={close}
          restoreFocus={restoreFocus}
          onChanged={() => {
            changed.current = true
            setMode(null)
            onChanged()
          }}
        />
      ) : null}
      <ConfirmDialog
        open={mode === 'delete'}
        title="Eliminar movimiento"
        description={`${services.ownerId.startsWith('guest') ? 'Se quitará del saldo y de tu actividad en este dispositivo.' : 'Se quitará del saldo y de tu actividad. Esta acción se sincronizará con tus dispositivos.'}${expense && movement.recurringOccurrenceId ? ' También se deshará el pago vinculado y su ocurrencia volverá a pendiente.' : ''}`}
        confirmLabel="Eliminar"
        isPending={pending}
        onCancel={close}
        onConfirm={() => void remove()}
        getPostCloseFocusTarget={restoreFocus}
      >
        {error ? <Notice tone="error" message={error} /> : null}
      </ConfirmDialog>
    </>
  )
}

function MovementEditor({
  movement,
  categories,
  onClose,
  onChanged,
  restoreFocus,
}: {
  movement: Movement
  categories: Category[]
  onClose(): void
  onChanged(): void
  restoreFocus(): HTMLElement | null
}) {
  const services = useApplicationServices()
  const prefix = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const expense = 'categoryId' in movement
  const [form, setForm] = useState(() => ({
    amount: formatCentsForInput(movement.amount),
    description: movement.description,
    date: movement.date,
    categoryId: expense ? movement.categoryId : '',
  }))
  useEffect(() => {
    amountRef.current?.focus()
  }, [])
  useEffect(() => {
    if (Object.keys(errors).length)
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus()
  }, [errors])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    const input = {
      ownerId: services.ownerId,
      periodId: movement.periodId,
      amount: parseMoneyInputToCents(form.amount),
      description: form.description,
      date: form.date,
      ...(expense ? { categoryId: form.categoryId } : {}),
    }
    const parsed = (
      expense ? createExpenseSchema : createIncomeSchema
    ).safeParse(input)
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setError(null)
    busy.current = true
    setPending(true)
    try {
      // Only editable fields: the use case retains identity, status and balance metadata.
      if (expense)
        await services.expenses.updateExpense.execute(movement.id, parsed.data)
      else await services.incomes.updateIncome.execute(movement.id, parsed.data)
      onChanged()
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === 'MovementPeriodError'
          ? 'No existe un periodo para esta fecha. Crea uno o elige una fecha compatible.'
          : 'No pudimos guardar el movimiento. Tus cambios siguen en el formulario; inténtalo de nuevo.',
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      title={expense ? 'Editar gasto' : 'Editar ingreso'}
      description="El tipo de movimiento se conserva. El periodo se determina según la fecha."
      onClose={() => {
        if (!busy.current) onClose()
      }}
      initialFocusRef={amountRef}
      pending={pending}
      getPostCloseFocusTarget={restoreFocus}
    >
      <form
        ref={formRef}
        className="stack-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        {error ? <Notice tone="error" message={error} /> : null}
        {(['amount', 'description', 'date'] as const).map((field) => (
          <FormField
            key={field}
            id={`${prefix}-${field}`}
            label={
              { amount: 'Monto', description: 'Descripción', date: 'Fecha' }[
                field
              ]
            }
            error={errors[field]}
          >
            <input
              ref={field === 'amount' ? amountRef : undefined}
              id={`${prefix}-${field}`}
              type={field === 'date' ? 'date' : 'text'}
              inputMode={field === 'amount' ? 'decimal' : undefined}
              maxLength={field === 'description' ? 200 : undefined}
              required
              disabled={pending}
              value={form[field]}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={
                errors[field] ? `${prefix}-${field}-error` : undefined
              }
              onChange={(event) =>
                setForm({ ...form, [field]: event.target.value })
              }
            />
          </FormField>
        ))}
        {expense ? (
          <FormField
            id={`${prefix}-categoryId`}
            label="Categoría"
            error={errors.categoryId}
          >
            <select
              id={`${prefix}-categoryId`}
              required
              disabled={pending}
              value={form.categoryId}
              aria-invalid={Boolean(errors.categoryId)}
              aria-describedby={
                errors.categoryId ? `${prefix}-categoryId-error` : undefined
              }
              onChange={(event) =>
                setForm({ ...form, categoryId: event.target.value })
              }
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        <div className="form-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={pending} loadingLabel="Guardando…">
            Guardar cambios
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
