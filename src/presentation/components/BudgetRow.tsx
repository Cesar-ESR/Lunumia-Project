import { useState, type FormEvent } from 'react'
import type { Category } from '@domain/entities'
import { FormField } from './FormField'
import { Notice } from './Notice'
import { friendlyError } from '../utils/forms'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'

export function BudgetRow({
  category,
  amount,
  onSave,
  onDelete,
}: {
  category: Category
  amount: number | null
  onSave(amount: number): Promise<void>
  onDelete?(): void
}) {
  const [value, setValue] = useState(
    amount === null ? '' : formatCentsForInput(amount),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cents = parseMoneyInputToCents(value, true)
    if (cents === null) {
      setError('Escribe un monto no negativo con máximo dos decimales.')
      return
    }
    setIsPending(true)
    setError(null)
    try {
      await onSave(cents)
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }
  return (
    <article className="budget-row">
      <div className="record-main">
        <span
          className="category-swatch"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />
        <div>
          <h3>
            {category.icon ? `${category.icon} ` : ''}
            {category.name}
          </h3>
          <p>{amount === null ? 'Sin presupuesto' : 'Presupuesto asignado'}</p>
        </div>
      </div>
      <form className="budget-form" onSubmit={submit} noValidate>
        <FormField
          id={`budget-${category.id}`}
          label="Monto"
          error={error ?? undefined}
        >
          <input
            id={`budget-${category.id}`}
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            aria-describedby={error ? `budget-${category.id}-error` : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
        </FormField>
        <button className="button" disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {onDelete ? (
          <button
            type="button"
            className="button ghost danger-text"
            disabled={isPending}
            onClick={onDelete}
          >
            Quitar
          </button>
        ) : null}
      </form>
      {error ? <Notice tone="error" message={error} /> : null}
    </article>
  )
}
