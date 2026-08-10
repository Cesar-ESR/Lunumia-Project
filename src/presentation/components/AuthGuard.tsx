import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from './LoadingState'
import { useAuth } from '../context/AuthContext'

export function AuthGuard({ allowGuest = false }: { allowGuest?: boolean }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading')
    return <LoadingState message="Restaurando sesión…" />
  if (
    allowGuest ||
    auth.status === 'authenticated' ||
    auth.status === 'offline-authenticated' ||
    (auth.status === 'revalidating' && auth.user !== null)
  )
    return <Outlet />
  return <Navigate to="/login" replace state={{ from: location.pathname }} />
}
