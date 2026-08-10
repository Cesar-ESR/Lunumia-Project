import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from './LoadingState'

export function AuthEntryGuard() {
  const auth = useAuth()
  if (auth.status === 'loading' || auth.status === 'revalidating')
    return <LoadingState message="Restaurando sesión…" />
  if (
    auth.status === 'authenticated' ||
    auth.status === 'offline-authenticated'
  ) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
