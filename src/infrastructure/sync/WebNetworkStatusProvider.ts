import type { NetworkStatusProvider } from '@application/services/SyncOrchestrator'

export class WebNetworkStatusProvider implements NetworkStatusProvider {
  isOnline(): boolean {
    return navigator.onLine
  }

  subscribe(listener: (online: boolean) => void): () => void {
    const handleOnline = () => listener(true)
    const handleOffline = () => listener(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }
}
