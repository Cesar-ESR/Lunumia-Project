import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react'
import type { CategoryBudgetSummary } from '@application/use-cases/budgets/GetCategoryBudgetSummaries'
import type { Category } from '@domain/entities'
import { Button } from './Button'
import { MoneyDisplay } from './MoneyDisplay'
import { MoneyField } from './MoneyField'
import { Notice } from './Notice'
import { friendlyError } from '../utils/forms'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../utils/money-input'

export function BudgetRow({
  category,
  summary,
  onSave,
  onDelete,
  focusRequested = false,
  onFocusHandled,
}: {
  category: Category
  summary: CategoryBudgetSummary
  onSave(amount: number): Promise<void>
  onDelete?(): void
  focusRequested?: boolean
  onFocusHandled?(): void
}) {
  const rowRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focusRequested) return
    rowRef.current?.focus()
    onFocusHandled?.()
  }, [focusRequested, onFocusHandled])

  const progressValue =
    summary.budgetCents !== null && summary.budgetCents > 0
      ? Math.min(100, (summary.spentCents / summary.budgetCents) * 100)
      : null
  const headingId = `budget-heading-${category.id}`
  const statusLabel =
    summary.status === 'over'
      ? 'Presupuesto excedido'
      : summary.status === 'within'
        ? 'Presupuesto configurado'
        : 'Sin presupuesto'
  const StatusIcon =
    summary.status === 'over'
      ? CircleAlert
      : summary.status === 'within'
        ? CircleCheck
        : CircleDashed
  return (
    <article
      ref={rowRef}
      className={`ln-budget-row ln-budget-row--${summary.status}`}
      aria-labelledby={headingId}
      tabIndex={-1}
    >
      <header className="ln-budget-category">
        <span
          className="ln-budget-category__swatch"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />
        <div>
          <h3 id={headingId}>
            {category.icon ? `${category.icon} ` : ''}
            {category.name}
          </h3>
          <p className={`ln-budget-status ln-budget-status--${summary.status}`}>
            <StatusIcon aria-hidden="true" />
            {statusLabel}
          </p>
        </div>
      </header>

      <dl className="ln-budget-facts">
        <div>
          <dt>Presupuesto</dt>
          <dd>
            {summary.budgetCents === null ? (
              'Sin presupuesto'
            ) : (
              <MoneyDisplay amount={summary.budgetCents} />
            )}
          </dd>
        </div>
        <div>
          <dt>Gastado</dt>
          <dd>
            <MoneyDisplay amount={summary.spentCents} />
          </dd>
        </div>
        <div>
          <dt>Restante</dt>
          <dd>
            {summary.remainingCents === null ? (
              'No aplica'
            ) : (
              <MoneyDisplay amount={summary.remainingCents} />
            )}
          </dd>
        </div>
      </dl>

      <div className="ln-budget-progress">
        {progressValue === null ? null : (
          <progress
            aria-label={`Progreso de ${category.name}`}
            aria-valuetext={
              summary.status === 'over'
                ? 'Presupuesto excedido. Consulta los importes en el texto adjunto.'
                : 'Gasto dentro del presupuesto. Consulta los importes en el texto adjunto.'
            }
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressValue}
            max={100}
            value={progressValue}
          />
        )}
        <p>
          {summary.status === 'not_configured' ? (
            <>
              Has gastado <MoneyDisplay amount={summary.spentCents} /> en esta
              categoría. No tiene presupuesto.
            </>
          ) : summary.budgetCents === null ||
            summary.remainingCents === null ? (
            <>No pudimos mostrar el progreso de esta categoría.</>
          ) : summary.budgetCents === 0 && summary.status === 'within' ? (
            <>
              Presupuesto configurado en{' '}
              <MoneyDisplay amount={summary.budgetCents} />. No hay progreso
              porcentual para un presupuesto de cero.
            </>
          ) : summary.status === 'over' ? (
            <>
              Has gastado <MoneyDisplay amount={summary.spentCents} /> de{' '}
              <MoneyDisplay amount={summary.budgetCents} />. Presupuesto
              excedido. Restante:{' '}
              <MoneyDisplay amount={summary.remainingCents} />.
            </>
          ) : (
            <>
              Has gastado <MoneyDisplay amount={summary.spentCents} /> de{' '}
              <MoneyDisplay amount={summary.budgetCents} />. Te quedan{' '}
              <MoneyDisplay amount={summary.remainingCents} />.
            </>
          )}
        </p>
      </div>

      <BudgetEditor
        key={summary.budgetCents ?? 'not-configured'}
        category={category}
        budgetCents={summary.budgetCents}
        onSave={onSave}
        onDelete={onDelete}
      />
    </article>
  )
}

function BudgetEditor({
  category,
  budgetCents,
  onSave,
  onDelete,
}: {
  category: Category
  budgetCents: CategoryBudgetSummary['budgetCents']
  onSave(amount: number): Promise<void>
  onDelete?(): void
}) {
  const [value, setValue] = useState(
    budgetCents === null ? '' : formatCentsForInput(budgetCents),
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
    <>
      <form className="ln-budget-form" onSubmit={submit} noValidate>
        <MoneyField
          id={`budget-${category.id}`}
          label={`Presupuesto para ${category.name}`}
          value={value}
          error={error ?? undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" loading={isPending} loadingLabel="Guardando…">
          {budgetCents === null ? 'Definir presupuesto' : 'Ajustar presupuesto'}
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="link"
            className="ln-budget-remove"
            disabled={isPending}
            onClick={onDelete}
          >
            Quitar presupuesto
          </Button>
        ) : null}
      </form>
      {error ? <Notice tone="error" message={error} /> : null}
    </>
  )
}
