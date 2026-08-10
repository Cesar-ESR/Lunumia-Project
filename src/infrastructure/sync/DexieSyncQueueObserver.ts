import { liveQuery } from 'dexie'
import type { SyncQueueObserver } from '@application/services/SyncOrchestrator'
import type { GastoClaroDB } from '@infrastructure/local/database'

const UPLOADABLE_STATUSES = ['pending', 'processing', 'error'] as const

export class DexieSyncQueueObserver implements SyncQueueObserver {
  constructor(private readonly database: GastoClaroDB) {}

  count(ownerId: string): Promise<number> {
    return this.database.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .filter((operation) => UPLOADABLE_STATUSES.includes(operation.status))
      .count()
  }

  subscribe(ownerId: string, listener: (count: number) => void): () => void {
    const subscription = liveQuery(() => this.count(ownerId)).subscribe({
      next: listener,
    })
    return () => subscription.unsubscribe()
  }
}
