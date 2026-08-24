import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from './LoadingState'

export function AuthEntryGuard() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading' || auth.status === 'revalidating')
    return <LoadingState message="Restaurando sesión…" />
  if (
    auth.status === 'authenticated' ||
    auth.status === 'offline-authenticated'
  ) {
    const state = location.state
    const destination =
      state &&
      typeof state === 'object' &&
      'from' in state &&
      typeof state.from === 'string' &&
      state.from.startsWith('/') &&
      !state.from.startsWith('//')
        ? state.from
        : '/inicio'
    return <Navigate to={destination} replace />
  }
  return <Outlet />
}
