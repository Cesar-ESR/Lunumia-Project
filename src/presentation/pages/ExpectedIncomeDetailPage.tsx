import { useCallback, useState } from 'react'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { Income, IncomeV2 } from '@domain/entities'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { MoneyDisplay } from '../components/MoneyDisplay'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { usePeriod } from '../context/PeriodContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { friendlyError } from '../utils/forms'
import { formatDetailDate } from '../utils/movement-view-model'

type PendingAction = 'receive' | 'cancel' | null

const statusCopy = {
  expected: {
    label: 'Esperado',
    description: 'Todavía no forma parte de tu saldo.',
  },
  received: {
    label: 'Recibido',
    description: 'Ya forma parte de tu historial de ingresos recibidos.',
  },
  cancelled: {
    label: 'Expectativa cancelada',
    description: 'El registro se conserva y no forma parte de tu saldo.',
  },
} as const

function isIncomeV2(income: Income): income is IncomeV2 {
  return 'status' in income
}

export function ExpectedIncomeDetailPage() {
  const { id = '' } = useParams()
  const services = useApplicationServices()
  const { activePeriod } = usePeriod()
  const load = useCallback(async () => {
    if (!activePeriod) return null
    const incomes = await services.incomes.listIncomesByPeriod.execute(
      activePeriod.id,
    )
    return incomes.find((income) => income.id === id) ?? null
  }, [activePeriod, id, services])
  const data = useAsyncData(load)
  const [updated, setUpdated] = useState<IncomeV2 | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [isPending, setIsPending] = useState(false)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'danger'
    message: string
  } | null>(null)
  const income = updated ?? data.data

  const transition = async (action: Exclude<PendingAction, null>) => {
    if (!income) return
    setIsPending(true)
    setNotice(null)
    try {
      const result =
        action === 'receive'
          ? await services.incomes.markIncomeAsReceived.execute(income.id)
          : await services.incomes.cancelExpectedIncome.execute(income.id)
      setUpdated(result)
      setPendingAction(null)
      setNotice({
        tone: 'success',
        message:
          action === 'receive'
            ? 'Ingreso marcado como recibido.'
            : 'Expectativa cancelada. Conservamos el registro en tu historial.',
      })
    } catch (reason) {
      setPendingAction(null)
      setNotice({ tone: 'danger', message: friendlyError(reason) })
    } finally {
      setIsPending(false)
    }
  }

  if (data.status === 'loading' && !data.data)
    return <LoadingState message="Cargando ingreso…" />
  if (data.status === 'error')
    return (
      <ErrorState
        message="No pudimos cargar este ingreso."
        onRetry={data.refresh}
      />
    )
  if (!income)
    return (
      <ErrorState
        title="Ingreso no disponible"
        message="No existe en el periodo activo o ya no está disponible."
      />
    )

  const status = isIncomeV2(income) ? income.status : 'received'
  const copy = statusCopy[status]
  const isHistorical =
    isIncomeV2(income) && status === 'received' && !income.affectsBalance
  return (
    <>
      <Link className="ln-back-link" to="/movimientos?tipo=ingresos">
        <ArrowLeft aria-hidden="true" /> Volver a Movimientos
      </Link>
      <PageHeader
        eyebrow="Ingreso"
        title={income.description}
        description={copy.description}
      />
      {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}
      <Surface className={`ln-income-detail ln-income-detail--${status}`}>
        <div className="ln-income-detail__icon" aria-hidden="true">
          <CalendarClock />
        </div>
        <div className="ln-income-detail__amount">
          <MoneyDisplay amount={income.amount} />
          <span className={`ln-status-label ln-status-label--${status}`}>
            {copy.label}
          </span>
        </div>
        <dl>
          <div>
            <dt>
              {status === 'expected' ? 'Fecha esperada' : 'Fecha registrada'}
            </dt>
            <dd>{formatDetailDate(income.date)}</dd>
          </div>
          <div>
            <dt>Contexto</dt>
            <dd>
              {isHistorical
                ? 'Agregado al historial · Ya estaba reflejado en tu saldo'
                : status === 'expected'
                  ? 'Dinero pendiente de recibir'
                  : status === 'cancelled'
                    ? 'Expectativa conservada como historial'
                    : 'Ingreso recibido'}
            </dd>
          </div>
        </dl>
        {status === 'expected' ? (
          <div className="ln-detail-actions">
            <button
              type="button"
              className="ln-button ln-button--primary"
              onClick={() => setPendingAction('receive')}
            >
              Marcar como recibido
            </button>
            <button
              type="button"
              className="ln-button ln-button--secondary"
              onClick={() => setPendingAction('cancel')}
            >
              Ya no espero recibirlo
            </button>
          </div>
        ) : null}
      </Surface>

      <ConfirmDialog
        open={pendingAction === 'receive'}
        title="Marcar ingreso como recibido"
        description="Se registrará como recibido ahora y pasará a formar parte de tu situación actual."
        confirmLabel="Marcar como recibido"
        destructive={false}
        isPending={isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void transition('receive')}
      />
      <ConfirmDialog
        open={pendingAction === 'cancel'}
        title="Cancelar expectativa"
        description="Conservarás el registro como una expectativa cancelada. No se eliminará."
        confirmLabel="Conservar como cancelada"
        destructive={false}
        isPending={isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void transition('cancel')}
      />
    </>
  )
}
