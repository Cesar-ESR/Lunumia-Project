import type { SyncScheduler } from '@application/services/SyncOrchestrator'

export class BrowserSyncScheduler implements SyncScheduler {
  now(): number {
    return Date.now()
  }

  setTimeout(callback: () => void, delayMs: number): unknown {
    return window.setTimeout(callback, delayMs)
  }

  clearTimeout(timer: unknown): void {
    window.clearTimeout(timer as number)
  }
}
