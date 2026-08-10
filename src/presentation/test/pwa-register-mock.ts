import { useState } from 'react'

export function useRegisterSW() {
  return {
    offlineReady: useState(false),
    needRefresh: useState(false),
    updateServiceWorker: async () => undefined,
  }
}
