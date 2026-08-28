import { Link } from 'react-router-dom'
import type { DashboardBudgetSummary } from '@application/use-cases/dashboard/GetDashboardBudgetSummary'
import type { ResourceUsageSummary } from '@application/use-cases/dashboard/GetResourceUsageSummary'
import { formatMoney } from '@shared/utils/money'
import { MoneyDisplay } from './MoneyDisplay'

type BudgetUsageFacts = Pick<
  DashboardBudgetSummary,
  'budgetRemaining' | 'spentCents' | 'totalBudget'
>

type HomeUsageProgressProps =
  | { mode: 'budget'; facts: BudgetUsageFacts }
  | { mode: 'resources'; facts: ResourceUsageSummary }
  | { mode: 'unknown' }

function BudgetUsage({ facts }: { facts: BudgetUsageFacts }) {
  const overBudget = facts.budgetRemaining < 0
  const percentage =
    facts.totalBudget > 0
      ? Math.round((facts.spentCents / facts.totalBudget) * 100)
      : null
  const boundedPercentage =
    percentage === null ? null : Math.min(100, Math.max(0, percentage))
  const remainingText = formatMoney(facts.budgetRemaining)
  const ariaValueText =
    percentage === null
      ? undefined
      : `${percentage}% del presupuesto utilizado. ${
          overBudget ? 'Presupuesto excedido. ' : ''
        }Restante ${remainingText}.`

  return (
    <div
      className={`ln-budget-usage ${overBudget ? 'ln-budget-usage--over' : ''}`.trim()}
    >
      <h4>Uso del presupuesto</h4>
      <p className="ln-budget-usage__amounts">
        <strong>
          <MoneyDisplay amount={facts.spentCents} />
        </strong>{' '}
        gastados de <MoneyDisplay amount={facts.totalBudget} /> planeados
      </p>
      {boundedPercentage === null ? (
        <p className="ln-budget-usage__supporting">
          No hay un porcentaje aplicable para un presupuesto configurado en
          cero.
        </p>
      ) : (
        <>
          <progress
            className="ln-budget-usage__progress"
            max={100}
            value={boundedPercentage}
            aria-label="Uso del presupuesto"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={boundedPercentage}
            aria-valuetext={ariaValueText}
          />
          <p className="ln-budget-usage__percentage">{percentage}% utilizado</p>
        </>
      )}
      <p className="ln-budget-usage__remaining">
        {overBudget ? (
          <>
            <strong>Presupuesto excedido</strong> · Restante{' '}
            <MoneyDisplay amount={facts.budgetRemaining} />
          </>
        ) : (
          <>
            Quedan <MoneyDisplay amount={facts.budgetRemaining} />
          </>
        )}
      </p>
    </div>
  )
}

function ResourceUsage({ facts }: { facts: ResourceUsageSummary }) {
  const percentage = facts.canCalculatePercentage
    ? Math.round((facts.spentCents / facts.resourceBaseCents) * 100)
    : null
  const boundedPercentage =
    percentage === null ? null : Math.min(100, Math.max(0, percentage))
  const negative = facts.status === 'negative'
  const ariaValueText =
    percentage === null
      ? undefined
      : `${percentage}% de los recursos utilizados. ${formatMoney(
          facts.spentCents,
        )} utilizados de ${formatMoney(
          facts.resourceBaseCents,
        )}. Actualmente disponibles ${formatMoney(
          facts.currentAvailableCents,
        )}.`

  return (
    <div
      className={`ln-budget-usage ${negative ? 'ln-budget-usage--over' : ''}`.trim()}
    >
      <div>
        <h4>Uso de tus recursos</h4>
        <p className="ln-budget-usage__context">
          {facts.hasOpeningBalance
            ? 'Saldo inicial y movimientos registrados.'
            : 'Calculado con tus movimientos registrados.'}
        </p>
      </div>
      <p className="ln-budget-usage__amounts">
        <strong>
          <MoneyDisplay amount={facts.spentCents} />
        </strong>{' '}
        utilizados de <MoneyDisplay amount={facts.resourceBaseCents} />{' '}
        disponibles
      </p>
      {boundedPercentage === null ? (
        <p className="ln-budget-usage__supporting">
          No hay un porcentaje aplicable para una base de recursos igual o menor
          que cero.
        </p>
      ) : (
        <>
          <progress
            className="ln-budget-usage__progress"
            max={100}
            value={boundedPercentage}
            aria-label="Uso de tus recursos"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={boundedPercentage}
            aria-valuetext={ariaValueText}
          />
          <p className="ln-budget-usage__percentage">{percentage}% utilizado</p>
        </>
      )}
      <p className="ln-budget-usage__remaining">
        {negative ? <strong>Recursos excedidos</strong> : null}
        {negative ? ' · ' : null}Actualmente disponibles:{' '}
        <MoneyDisplay amount={facts.currentAvailableCents} />
      </p>
    </div>
  )
}

export function HomeUsageProgress(props: HomeUsageProgressProps) {
  if (props.mode === 'budget') return <BudgetUsage facts={props.facts} />
  if (props.mode === 'resources') return <ResourceUsage facts={props.facts} />

  return (
    <div className="ln-budget-usage ln-budget-usage--empty">
      <h4>Uso de tus recursos</h4>
      <p>
        Registra movimientos para conocer cómo utilizas tus recursos. El saldo
        inicial es opcional.
      </p>
      <Link className="ln-button ln-button--secondary" to="/saldo/inicial">
        Agregar saldo inicial
      </Link>
    </div>
  )
}
