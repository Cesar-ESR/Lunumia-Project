import { useCallback, useMemo, type ReactNode } from 'react'
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarClock,
  ChevronRight,
  History,
  XCircle,
} from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { InteractiveRow } from '../components/InteractiveRow'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import {
  expenseToMovementViewModel,
  formatCompactDate,
  incomeToMovementViewModel,
  sortMovements,
  type MovementKind,
  type MovementListItem,
} from '../utils/movement-view-model'

type IncomeStateFilter = 'recibidos' | 'esperados' | 'cancelados'

const kindIcon: Record<MovementKind, ReactNode> = {
  expense: <BanknoteArrowDown aria-hidden="true" />,
  'income-received': <BanknoteArrowUp aria-hidden="true" />,
  'income-expected': <CalendarClock aria-hidden="true" />,
  'income-cancelled': <XCircle aria-hidden="true" />,
}

const stateToKind: Record<IncomeStateFilter, MovementKind> = {
  recibidos: 'income-received',
  esperados: 'income-expected',
  cancelados: 'income-cancelled',
}

function isIncomeState(value: string | null): value is IncomeStateFilter {
  return (
    value === 'recibidos' || value === 'esperados' || value === 'cancelados'
  )
}

function emptyCopy(params: URLSearchParams): readonly [string, string] {
  if (params.get('historial') === 'si')
    return [
      'No hay movimientos históricos',
      'Los registros ya considerados en tu saldo aparecerán aquí.',
    ]
  if (params.get('tipo') === 'gastos')
    return ['No hay gastos', 'No hay gastos que coincidan con estos filtros.']
  if (params.get('estado') === 'esperados')
    return [
      'No hay ingresos esperados',
      'Agrega una expectativa para verla en esta lista.',
    ]
  if (params.get('estado') === 'recibidos')
    return [
      'No hay ingresos recibidos',
      'Los ingresos recibidos del periodo aparecerán aquí.',
    ]
  if (params.get('estado') === 'cancelados')
    return [
      'No hay expectativas canceladas',
      'Cancelar conserva el registro; no lo elimina.',
    ]
  return [
    'No hay movimientos en este periodo',
    'Registra un ingreso o un gasto para comenzar.',
  ]
}

function isMovementNoticeState(
  state: unknown,
): state is { movementNotice: string } {
  return (
    typeof state === 'object' &&
    state !== null &&
    'movementNotice' in state &&
    typeof state.movementNotice === 'string'
  )
}

export function MovementsPage() {
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const load = useCallback(async () => {
    if (!activePeriod) return { incomes: [], expenses: [], categories: [] }
    const [incomes, expenses, categories] = await Promise.all([
      services.incomes.listIncomesByPeriod.execute(activePeriod.id),
      services.expenses.listExpensesByPeriod.execute(activePeriod.id),
      services.categories.listCategories.execute(),
    ])
    return { incomes, expenses, categories }
  }, [activePeriod, services])
  const data = useAsyncData(load)

  const movements = useMemo(() => {
    if (!data.data) return []
    const categories = new Map(
      data.data.categories.map((category) => [category.id, category]),
    )
    return sortMovements([
      ...data.data.incomes.map(incomeToMovementViewModel),
      ...data.data.expenses.map((expense) =>
        expenseToMovementViewModel(expense, categories.get(expense.categoryId)),
      ),
    ])
  }, [data.data])

  const filtered = useMemo(() => {
    const type = searchParams.get('tipo')
    const rawState = searchParams.get('estado')
    const state = isIncomeState(rawState) ? rawState : null
    const categoryId = searchParams.get('categoria')
    const date = searchParams.get('fecha')
    const historicalOnly = searchParams.get('historial') === 'si'
    return movements.filter((movement) => {
      if (type === 'gastos' && movement.kind !== 'expense') return false
      if (type === 'ingresos' && movement.kind === 'expense') return false
      if (state && movement.kind !== stateToKind[state]) return false
      if (categoryId && movement.categoryId !== categoryId) return false
      if (date && movement.date !== date) return false
      if (historicalOnly && !movement.historical) return false
      return true
    })
  }, [movements, searchParams])

  const updateFilters = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates))
      if (value) next.set(key, value)
      else next.delete(key)
    setSearchParams(next)
  }

  if (!activePeriod)
    return (
      <>
        <PageHeader
          eyebrow="Dinero"
          title="Movimientos"
          description="Consulta ingresos y gastos en un solo lugar."
        />
        <EmptyState
          title="Selecciona un periodo"
          description="Necesitas un periodo activo para consultar movimientos."
          action={
            <Link className="ln-button ln-button--primary" to="/plan/periodos">
              Administrar periodos
            </Link>
          }
        />
      </>
    )

  const [emptyTitle, emptyDescription] = emptyCopy(searchParams)
  const categoryOptions = data.data?.categories ?? []
  const selectedType = searchParams.get('tipo')
  const selectedState = searchParams.get('estado')
  const isSelected = (type: string | null, state: string | null = null) =>
    selectedType === type && selectedState === state

  return (
    <>
      <PageHeader
        eyebrow="Dinero"
        title="Movimientos"
        description={`${formatCompactDate(activePeriod.startDate)} — ${formatCompactDate(activePeriod.endDate)}`}
        actions={
          <Link
            className="ln-button ln-button--primary"
            to="/movimientos/ingresos/nuevo"
          >
            Registrar ingreso
          </Link>
        }
      />
      {isMovementNoticeState(location.state) ? (
        <Notice message={location.state.movementNotice} />
      ) : null}
      <Surface
        className="ln-movement-filters"
        aria-label="Filtros de movimientos"
      >
        <div
          className="ln-filter-buttons"
          role="group"
          aria-label="Tipo de movimiento"
        >
          <button
            type="button"
            aria-pressed={isSelected(null)}
            onClick={() => updateFilters({ tipo: null, estado: null })}
          >
            Todos
          </button>
          <button
            type="button"
            aria-pressed={isSelected('gastos')}
            onClick={() => updateFilters({ tipo: 'gastos', estado: null })}
          >
            Gastos
          </button>
          <button
            type="button"
            aria-pressed={isSelected('ingresos', 'recibidos')}
            onClick={() =>
              updateFilters({ tipo: 'ingresos', estado: 'recibidos' })
            }
          >
            Recibidos
          </button>
          <button
            type="button"
            aria-pressed={isSelected('ingresos', 'esperados')}
            onClick={() =>
              updateFilters({ tipo: 'ingresos', estado: 'esperados' })
            }
          >
            Esperados
          </button>
          <button
            type="button"
            aria-pressed={isSelected('ingresos', 'cancelados')}
            onClick={() =>
              updateFilters({ tipo: 'ingresos', estado: 'cancelados' })
            }
          >
            Canceladas
          </button>
        </div>
        <div className="ln-secondary-filters">
          <label>
            <span>Categoría</span>
            <select
              value={searchParams.get('categoria') ?? ''}
              onChange={(event) =>
                updateFilters({ categoria: event.target.value || null })
              }
            >
              <option value="">Todas</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fecha</span>
            <input
              type="date"
              min={activePeriod.startDate}
              max={activePeriod.endDate}
              value={searchParams.get('fecha') ?? ''}
              onChange={(event) =>
                updateFilters({ fecha: event.target.value || null })
              }
            />
          </label>
          <button
            type="button"
            className="ln-history-filter"
            aria-pressed={searchParams.get('historial') === 'si'}
            onClick={() =>
              updateFilters({
                historial: searchParams.get('historial') === 'si' ? null : 'si',
              })
            }
          >
            <History aria-hidden="true" /> Históricos
          </button>
        </div>
      </Surface>

      {data.status === 'loading' && !data.data ? (
        <LoadingState message="Cargando movimientos…" />
      ) : null}
      {data.status === 'error' ? (
        <ErrorState
          message="No pudimos cargar los movimientos de este periodo."
          onRetry={data.refresh}
        />
      ) : null}
      {data.status === 'success' && filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={
            selectedState === 'esperados' ? (
              <Link
                className="ln-button ln-button--primary"
                to="/movimientos/ingresos/nuevo?modo=esperado"
              >
                Agregar ingreso esperado
              </Link>
            ) : undefined
          }
        />
      ) : null}
      {filtered.length ? (
        <Surface
          className="ln-movement-list"
          aria-label="Movimientos del periodo"
        >
          {filtered.map((movement) => (
            <MovementRow
              key={`${movement.kind}:${movement.id}`}
              movement={movement}
            />
          ))}
        </Surface>
      ) : null}
    </>
  )
}

function MovementRow({ movement }: { movement: MovementListItem }) {
  const context = [
    formatCompactDate(movement.date),
    movement.categoryOrOrigin,
    movement.recurringContext,
    movement.historicalContext,
  ]
    .filter(Boolean)
    .join(' · ')
  const action = movement.navigationTarget ? (
    <Link
      className="ln-row-link"
      to={movement.navigationTarget}
      aria-label={`Abrir ${movement.description}, ${movement.statusLabel}`}
    >
      <ChevronRight aria-hidden="true" />
    </Link>
  ) : undefined
  return (
    <InteractiveRow
      leading={kindIcon[movement.kind]}
      action={action}
      className={`ln-movement-row ln-movement-row--${movement.kind}`}
    >
      <div className="ln-movement-row__main">
        <div>
          <h2>{movement.description}</h2>
          <p>{context}</p>
        </div>
        <div className="ln-movement-row__amount">
          <MoneyDisplay amount={movement.amountCents} />
          <span className={`ln-status-label ln-status-label--${movement.kind}`}>
            {movement.statusLabel}
          </span>
        </div>
      </div>
    </InteractiveRow>
  )
}
