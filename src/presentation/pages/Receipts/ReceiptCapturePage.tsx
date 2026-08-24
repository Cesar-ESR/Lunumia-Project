import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoadingState } from '../../components/LoadingState'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/PageHeader'
import { useApplicationServices } from '../../context/ApplicationServicesContext'
import { useAuth } from '../../context/AuthContext'
import { usePeriod } from '../../context/PeriodContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { ReceiptCaptureFlow } from './ReceiptCaptureFlow'

export function ReceiptCapturePage() {
  const services = useApplicationServices()
  const auth = useAuth()
  const { periods, activePeriod } = usePeriod()
  const navigate = useNavigate()
  const load = useCallback(async () => {
    const [categories, settings] = await Promise.all([
      services.categories.listCategories.execute(),
      services.settings.getUserSettings.execute(),
    ])
    return { categories, currency: settings?.currency ?? 'MXN' }
  }, [services])
  const data = useAsyncData(load)

  return (
    <>
      <PageHeader
        eyebrow="Gastos"
        title="Escanear recibo"
        description="Captura los datos del recibo y confírmalos antes de crear el gasto."
      />
      {data.status === 'loading' && !data.data ? (
        <LoadingState message="Preparando captura…" />
      ) : null}
      {data.status === 'error' ? (
        <ErrorState message={data.error.message} onRetry={data.refresh} />
      ) : null}
      {data.data ? (
        <ReceiptCaptureFlow
          key={services.ownerId}
          ownerId={services.ownerId}
          authStatus={auth.status}
          currency={data.data.currency}
          categories={data.data.categories}
          periods={periods}
          activePeriodId={activePeriod?.id ?? null}
          receiptServices={services.receipts}
          createExpense={services.expenses.createExpense}
          onCreated={() =>
            navigate('/expenses', {
              replace: true,
              state: { receiptCreated: true },
            })
          }
          onCancel={() => navigate('/expenses')}
          onSignIn={() => navigate('/login')}
          onManagePeriods={() => navigate('/plan/periodos')}
        />
      ) : null}
    </>
  )
}
