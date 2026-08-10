import type { SyncError, SyncErrorKind, SyncResult } from './SyncCoordinator'

export type SyncStatus =
  'idle' | 'offline' | 'pending' | 'syncing' | 'up_to_date' | 'error'

export interface PublicSyncError {
  kind: SyncErrorKind
  code: string | null
  retryable: boolean
  message: string
}

export interface SyncState {
  status: SyncStatus
  ownerId: string | null
  pendingCount: number
  isOnline: boolean
  isSyncing: boolean
  lastAttemptAt: string | null
  lastSuccessfulSyncAt: string | null
  nextRetryAt: string | null
  retryCount: number
  error: PublicSyncError | null
  lastResult: SyncResult | null
  canRetryManually: boolean
}

export interface SyncExecutor {
  sync(ownerId: string): Promise<SyncResult>
}

export interface SyncQueueObserver {
  count(ownerId: string): Promise<number>
  subscribe(ownerId: string, listener: (count: number) => void): () => void
}

export interface NetworkStatusProvider {
  isOnline(): boolean
  subscribe(listener: (online: boolean) => void): () => void
}

export interface SyncScheduler {
  now(): number
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(timer: unknown): void
}

export interface SyncRetryConfig {
  baseDelayMs: number
  maxDelayMs: number
  multiplier: number
  jitterRatio: number
  maxAutomaticRetries: number
}

export const DEFAULT_SYNC_RETRY_CONFIG: Readonly<SyncRetryConfig> = {
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  multiplier: 2,
  jitterRatio: 0.2,
  maxAutomaticRetries: 10,
}

export function calculateBackoffDelay(
  retryCount: number,
  config: SyncRetryConfig = DEFAULT_SYNC_RETRY_CONFIG,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, retryCount - 1)
  const base = Math.min(
    config.baseDelayMs * config.multiplier ** exponent,
    config.maxDelayMs,
  )
  const jitter = base * config.jitterRatio * (random() * 2 - 1)
  return Math.max(0, Math.min(config.maxDelayMs, Math.round(base + jitter)))
}

const INITIAL_STATE: SyncState = {
  status: 'idle',
  ownerId: null,
  pendingCount: 0,
  isOnline: true,
  isSyncing: false,
  lastAttemptAt: null,
  lastSuccessfulSyncAt: null,
  nextRetryAt: null,
  retryCount: 0,
  error: null,
  lastResult: null,
  canRetryManually: false,
}

/**
 * Coordina una sola pestaña. El diseño actual no exige liderazgo entre pestañas;
 * los temporizadores viven en memoria y la cola persistida se retoma al abrir.
 */
export class SyncOrchestrator {
  private state: SyncState
  private ownerGeneration = 0
  private activePromise: Promise<SyncResult | null> | null = null
  private retryTimer: unknown = null
  private unsubscribeNetwork: (() => void) | null = null
  private unsubscribeQueue: (() => void) | null = null
  private readonly listeners = new Set<(state: SyncState) => void>()
  private rerunRequested = false
  private started = false
  private paused = false

  constructor(
    private readonly executor: SyncExecutor,
    private readonly queue: SyncQueueObserver,
    private readonly network: NetworkStatusProvider,
    private readonly scheduler: SyncScheduler,
    private readonly retryConfig: SyncRetryConfig = DEFAULT_SYNC_RETRY_CONFIG,
    private readonly random: () => number = Math.random,
  ) {
    this.state = { ...INITIAL_STATE, isOnline: network.isOnline() }
  }

  getState(): SyncState {
    return this.state
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  start(ownerId: string | null): void {
    if (!this.started) {
      this.started = true
      this.unsubscribeNetwork = this.network.subscribe((online) =>
        this.handleNetworkChange(online),
      )
    }
    this.setOwner(ownerId)
  }

  setOwner(ownerId: string | null): void {
    if (ownerId === this.state.ownerId && this.started) return
    this.ownerGeneration += 1
    this.cancelRetry()
    this.unsubscribeQueue?.()
    this.unsubscribeQueue = null
    this.rerunRequested = false
    const isOnline = this.network.isOnline()
    const synchronizableOwner = isSynchronizableOwner(ownerId) ? ownerId : null
    this.publish({
      ...INITIAL_STATE,
      ownerId: synchronizableOwner,
      isOnline,
      status: synchronizableOwner && !isOnline ? 'offline' : 'idle',
    })
    if (!synchronizableOwner) return

    const generation = this.ownerGeneration
    this.unsubscribeQueue = this.queue.subscribe(
      synchronizableOwner,
      (count) => {
        if (generation !== this.ownerGeneration) return
        this.handleQueueCount(count)
      },
    )
    void this.refreshPendingCount(synchronizableOwner, generation)
    if (isOnline) void this.runSync('automatic')
  }

  stop(): void {
    this.started = false
    this.ownerGeneration += 1
    this.cancelRetry()
    this.unsubscribeQueue?.()
    this.unsubscribeQueue = null
    this.unsubscribeNetwork?.()
    this.unsubscribeNetwork = null
    this.rerunRequested = false
    this.paused = false
    this.publish({
      ...INITIAL_STATE,
      isOnline: this.network.isOnline(),
    })
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  syncNow(): Promise<SyncResult | null> {
    this.cancelRetry()
    return this.runSync('manual')
  }

  private runSync(trigger: 'automatic' | 'manual'): Promise<SyncResult | null> {
    if (this.paused) {
      this.rerunRequested = true
      return Promise.resolve(null)
    }
    const ownerId = this.state.ownerId
    if (!isSynchronizableOwner(ownerId)) return Promise.resolve(null)
    if (!this.network.isOnline()) {
      this.publish({
        ...this.state,
        isOnline: false,
        isSyncing: false,
        status: 'offline',
        nextRetryAt: null,
      })
      return Promise.resolve(null)
    }
    if (this.activePromise) return this.activePromise

    const generation = this.ownerGeneration
    const attemptAt = new Date(this.scheduler.now()).toISOString()
    this.publish({
      ...this.state,
      status: 'syncing',
      isOnline: true,
      isSyncing: true,
      lastAttemptAt: attemptAt,
      nextRetryAt: null,
      error: null,
      canRetryManually: false,
    })

    const execution = this.execute(ownerId, generation, trigger)
    this.activePromise = execution
    void execution.finally(() => {
      if (this.activePromise === execution) this.activePromise = null
      if (
        this.rerunRequested &&
        generation === this.ownerGeneration &&
        this.network.isOnline()
      ) {
        this.rerunRequested = false
        queueMicrotask(() => void this.runSync('automatic'))
      }
    })
    return execution
  }

  private async execute(
    ownerId: string,
    generation: number,
    trigger: 'automatic' | 'manual',
  ): Promise<SyncResult | null> {
    try {
      const result = await this.executor.sync(ownerId)
      if (generation !== this.ownerGeneration) return result
      const pendingCount = await this.queue.count(ownerId)
      if (generation !== this.ownerGeneration) return result
      if (!this.network.isOnline()) {
        this.publish({
          ...this.state,
          isOnline: false,
          isSyncing: false,
          pendingCount,
          status: 'offline',
          lastResult: result,
        })
        return result
      }

      const failure = result.errors[0]
      if (result.failed > 0 || failure) {
        this.handleFailure(
          failure ?? unknownResultFailure(),
          result,
          pendingCount,
        )
      } else {
        this.cancelRetry()
        this.publish({
          ...this.state,
          status: pendingCount > 0 ? 'pending' : 'up_to_date',
          isSyncing: false,
          pendingCount,
          retryCount: 0,
          error: null,
          lastResult: result,
          lastSuccessfulSyncAt: result.finishedAt,
          canRetryManually: pendingCount > 0,
        })
      }
      return result
    } catch (error) {
      if (generation !== this.ownerGeneration) return null
      const failure: SyncError = {
        stage: 'validation',
        kind: 'unknown',
        code: 'orchestrator_failure',
        retryable: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
      this.handleFailure(failure, null, this.state.pendingCount)
      return null
    } finally {
      if (trigger === 'manual' && generation !== this.ownerGeneration)
        this.cancelRetry()
    }
  }

  private handleFailure(
    failure: SyncError,
    result: SyncResult | null,
    pendingCount: number,
  ): void {
    this.rerunRequested = false
    const publicError = sanitizeError(failure)
    const nextRetryCount = failure.retryable
      ? this.state.retryCount + 1
      : this.state.retryCount
    this.publish({
      ...this.state,
      status: 'error',
      isSyncing: false,
      pendingCount,
      retryCount: nextRetryCount,
      error: publicError,
      lastResult: result,
      canRetryManually: true,
    })
    if (
      failure.retryable &&
      pendingCount > 0 &&
      nextRetryCount <= this.retryConfig.maxAutomaticRetries &&
      this.network.isOnline()
    ) {
      this.scheduleRetry(nextRetryCount)
    } else {
      this.cancelRetry()
    }
  }

  private scheduleRetry(retryCount: number): void {
    this.cancelRetry()
    const delay = calculateBackoffDelay(
      retryCount,
      this.retryConfig,
      this.random,
    )
    const ownerId = this.state.ownerId
    const generation = this.ownerGeneration
    this.retryTimer = this.scheduler.setTimeout(() => {
      this.retryTimer = null
      if (
        generation !== this.ownerGeneration ||
        ownerId !== this.state.ownerId ||
        !this.network.isOnline()
      )
        return
      void this.runSync('automatic')
    }, delay)
    this.publish({
      ...this.state,
      nextRetryAt: new Date(this.scheduler.now() + delay).toISOString(),
    })
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) {
      this.scheduler.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.state.nextRetryAt !== null)
      this.publish({ ...this.state, nextRetryAt: null })
  }

  private handleNetworkChange(online: boolean): void {
    const wasOnline = this.state.isOnline
    if (online === wasOnline) return
    if (!online) {
      this.cancelRetry()
      this.publish({
        ...this.state,
        isOnline: false,
        isSyncing: false,
        status: this.state.ownerId ? 'offline' : 'idle',
      })
      return
    }
    this.publish({
      ...this.state,
      isOnline: true,
      status: this.state.ownerId
        ? this.state.pendingCount > 0
          ? 'pending'
          : 'idle'
        : 'idle',
    })
    if (this.state.ownerId) void this.runSync('automatic')
  }

  private handleQueueCount(count: number): void {
    if (count === 0) this.cancelRetry()
    const increased = count > this.state.pendingCount
    const status = this.state.isSyncing
      ? 'syncing'
      : !this.state.isOnline
        ? 'offline'
        : count > 0
          ? 'pending'
          : this.state.lastSuccessfulSyncAt
            ? 'up_to_date'
            : 'idle'
    this.publish({ ...this.state, pendingCount: count, status })
    if (!increased || !this.state.isOnline) return
    if (this.activePromise) this.rerunRequested = true
    else void this.runSync('automatic')
  }

  private async refreshPendingCount(
    ownerId: string,
    generation: number,
  ): Promise<void> {
    try {
      const count = await this.queue.count(ownerId)
      if (generation === this.ownerGeneration) this.handleQueueCount(count)
    } catch {
      if (generation !== this.ownerGeneration) return
      this.publish({
        ...this.state,
        status: 'error',
        error: {
          kind: 'unknown',
          code: 'queue_read_failed',
          retryable: false,
          message: 'No fue posible consultar los cambios pendientes.',
        },
        canRetryManually: true,
      })
    }
  }

  private publish(state: SyncState): void {
    this.state = state
    this.listeners.forEach((listener) => listener(state))
  }
}

function isSynchronizableOwner(ownerId: string | null): ownerId is string {
  return ownerId !== null && !ownerId.startsWith('guest:')
}

function unknownResultFailure(): SyncError {
  return {
    stage: 'validation',
    kind: 'unknown',
    code: 'sync_failed',
    retryable: false,
    message: 'La sincronización no pudo completarse.',
  }
}

function sanitizeError(error: SyncError): PublicSyncError {
  const messages: Record<SyncErrorKind, string> = {
    network: 'No se pudo conectar. Se reintentará automáticamente.',
    unauthenticated: 'La sesión requiere revalidación antes de sincronizar.',
    permission_denied:
      'Tu sesión no tiene permiso para sincronizar estos datos.',
    validation:
      'Hay datos locales que necesitan revisión antes de sincronizar.',
    conflict: 'Un cambio no pudo resolverse automáticamente.',
    server: 'El servicio no está disponible. Se reintentará automáticamente.',
    unknown: 'No fue posible completar la sincronización.',
  }
  return {
    kind: error.kind,
    code: error.code,
    retryable: error.retryable,
    message: messages[error.kind],
  }
}
