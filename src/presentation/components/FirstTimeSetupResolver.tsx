import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { useAuth } from '../context/AuthContext'
import { usePeriod } from '../context/PeriodContext'
import { readInternalDestination } from '../utils/first-time'

const welcomePath = '/configuracion-inicial'
const periodSetupPath = '/configuracion-inicial/periodo'
const categorySetupPath = '/configuracion-inicial/categorias'

export function FirstTimeSetupResolver() {
  const auth = useAuth()
  const period = usePeriod()
  const location = useLocation()
  const currentDestination = `${location.pathname}${location.search}${location.hash}`

  if (auth.pendingGuestData)
    return (
      <LoadingState message="Esperando tu decisión sobre los datos locales…" />
    )
  if (period.isLoading)
    return <LoadingState message="Preparando tus datos locales…" />
  if (period.error)
    return (
      <ErrorState
        title="No pudimos preparar Lunumia"
        message={period.error.message}
        onRetry={() => void period.refreshPeriods()}
      />
    )

  const isWelcomePath = location.pathname === welcomePath
  const isPeriodSetupPath = location.pathname === periodSetupPath
  const isCategorySetupPath = location.pathname === categorySetupPath
  const setupState = location.state
  const isActiveSetupFlow = Boolean(
    setupState &&
    typeof setupState === 'object' &&
    'firstTimeSetup' in setupState &&
    setupState.firstTimeSetup === true,
  )

  if (
    !period.activePeriod &&
    !isWelcomePath &&
    !isPeriodSetupPath &&
    !isCategorySetupPath
  )
    return (
      <Navigate
        to={welcomePath}
        replace
        state={{ from: currentDestination, firstTimeSetup: true }}
      />
    )

  if (!period.activePeriod && isCategorySetupPath)
    return (
      <Navigate
        to={welcomePath}
        replace
        state={{
          from: readInternalDestination(location.state),
          firstTimeSetup: true,
        }}
      />
    )

  if (!period.activePeriod && isPeriodSetupPath && !isActiveSetupFlow)
    return (
      <Navigate
        to={periodSetupPath}
        replace
        state={{
          from: readInternalDestination(location.state),
          firstTimeSetup: true,
        }}
      />
    )

  if (
    period.activePeriod &&
    (isWelcomePath || (isPeriodSetupPath && !isActiveSetupFlow))
  )
    return <Navigate to={readInternalDestination(location.state)} replace />

  return <Outlet />
}
