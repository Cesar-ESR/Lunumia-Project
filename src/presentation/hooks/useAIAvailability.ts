import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'

export function useAIAvailability(providerAvailable: boolean): boolean {
  const auth = useAuth()
  const sync = useSync()
  const hasUsableSession =
    auth.user !== null &&
    (auth.status === 'authenticated' || auth.status === 'offline-authenticated')

  return providerAvailable && hasUsableSession && sync.isOnline
}
