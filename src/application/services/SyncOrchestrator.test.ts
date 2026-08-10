import { describe, expect, it, vi } from 'vitest'
import type { SyncErrorKind, SyncResult } from './SyncCoordinator'
import {
  DEFAULT_SYNC_RETRY_CONFIG,
  SyncOrchestrator,
  calculateBackoffDelay,
  type NetworkStatusProvider,
  type SyncQueueObserver,
  type SyncScheduler,
} from './SyncOrchestrator'

const OWNER_A = '11111111-1111-4111-8111-111111111111'
const OWNER_B = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-08-01T12:00:00.000Z')

class FakeNetwork implements NetworkStatusProvider {
  private readonly listeners = new Set<(online: boolean) => void>()
  constructor(private online: boolean) {}
  isOnline() {
    return this.online
  }
  subscribe(listener: (online: boolean) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  setOnline(online: boolean) {
    this.online = online
    this.listeners.forEach((listener) => listener(online))
  }
  listenerCount() {
    return this.listeners.size
  }
}

class FakeQueue implements SyncQueueObserver {
  private readonly counts = new Map<string, number>()
  private readonly listeners = new Map<string, Set<(count: number) => void>>()
  async count(ownerId: string) {
    return this.counts.get(ownerId) ?? 0
  }
  subscribe(ownerId: string, listener: (count: number) => void) {
    const ownerListeners = this.listeners.get(ownerId) ?? new Set()
    ownerListeners.add(listener)
    this.listeners.set(ownerId, ownerListeners)
    return () => ownerListeners.delete(listener)
  }
  emit(ownerId: string, count: number) {
    this.counts.set(ownerId, count)
    this.listeners.get(ownerId)?.forEach((listener) => listener(count))
  }
  listenerCount(ownerId: string) {
    return this.listeners.get(ownerId)?.size ?? 0
  }
}

class FakeScheduler implements SyncScheduler {
  private sequence = 0
  private time = NOW
  readonly tasks = new Map<number, { callback: () => void; at: number }>()
  now() {
    return this.time
  }
  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = ++this.sequence
    this.tasks.set(id, { callback, at: this.time + delayMs })
    return id
  }
  clearTimeout(timer: unknown) {
    this.tasks.delete(timer as number)
  }
  advance(delayMs: number) {
    this.time += delayMs
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= this.time)
        .sort((left, right) => left[1].at - right[1].at)[0]
      if (!due) break
      this.tasks.delete(due[0])
      due[1].callback()
    }
  }
  nextDelay() {
    const next = [...this.tasks.values()].sort((a, b) => a.at - b.at)[0]
    return next ? next.at - this.time : null
  }
}

function success(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
    startedAt: new Date(NOW).toISOString(),
    finishedAt: new Date(NOW + 10).toISOString(),
    errors: [],
    ...overrides,
  }
}

function failure(
  kind: SyncErrorKind,
  retryable: boolean,
  code: string | null = null,
): SyncResult {
  return success({
    failed: 1,
    errors: [
      {
        stage: 'upload',
        kind,
        code,
        retryable,
        message: 'technical detail that must not reach the UI',
      },
    ],
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setup({
  online = true,
  execute = vi.fn().mockResolvedValue(success()),
}: {
  online?: boolean
  execute?: ReturnType<typeof vi.fn<(ownerId: string) => Promise<SyncResult>>>
} = {}) {
  const network = new FakeNetwork(online)
  const queue = new FakeQueue()
  const scheduler = new FakeScheduler()
  const orchestrator = new SyncOrchestrator(
    { sync: execute },
    queue,
    network,
    scheduler,
    DEFAULT_SYNC_RETRY_CONFIG,
    () => 0.5,
  )
  return { orchestrator, network, queue, scheduler, execute }
}

describe('SyncOrchestrator', () => {
  it('ignora propietarios invitados y no llama al motor remoto', async () => {
    const { orchestrator, execute, network } = setup()
    orchestrator.start('guest:local')
    await settle()
    expect(execute).not.toHaveBeenCalled()
    expect(orchestrator.getState().ownerId).toBeNull()
    expect(network.listenerCount()).toBe(1)
  })

  it('sincroniza una vez al restaurar una sesión autenticada', async () => {
    const { orchestrator, execute } = setup()
    orchestrator.start(OWNER_A)
    await settle()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(OWNER_A)
    expect(orchestrator.getState().status).toBe('up_to_date')
  })

  it('pausa nuevas peticiones hasta que Auth complete la revalidación', async () => {
    const { orchestrator, execute } = setup()
    orchestrator.pause()
    orchestrator.start(OWNER_A)
    await settle()
    expect(execute).not.toHaveBeenCalled()
    orchestrator.resume()
    await orchestrator.syncNow()
    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(OWNER_A)
  })

  it('reutiliza la promesa activa para solicitudes concurrentes', async () => {
    const pending = deferred<SyncResult>()
    const execute = vi.fn(() => pending.promise)
    const { orchestrator } = setup({ execute })
    orchestrator.start(OWNER_A)
    const first = orchestrator.syncNow()
    const second = orchestrator.syncNow()
    expect(first).toBe(second)
    expect(execute).toHaveBeenCalledTimes(1)
    pending.resolve(success())
    await first
  })

  it('sincroniza al aumentar la cola y no por emisiones repetidas', async () => {
    const { orchestrator, execute, queue } = setup()
    orchestrator.start(OWNER_A)
    await settle()
    execute.mockClear()
    queue.emit(OWNER_A, 1)
    await settle()
    expect(execute).toHaveBeenCalledTimes(1)
    queue.emit(OWNER_A, 1)
    await settle()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('solicita una segunda ejecución si llega una operación durante la activa', async () => {
    const pending = deferred<SyncResult>()
    const execute = vi
      .fn<(ownerId: string) => Promise<SyncResult>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(success())
    const { orchestrator, queue } = setup({ execute })
    orchestrator.start(OWNER_A)
    queue.emit(OWNER_A, 1)
    pending.resolve(success())
    queue.emit(OWNER_A, 0)
    await settle()
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('permanece local estando offline y sincroniza una vez al reconectar', async () => {
    const { orchestrator, execute, network, queue } = setup({ online: false })
    orchestrator.start(OWNER_A)
    queue.emit(OWNER_A, 2)
    await settle()
    expect(execute).not.toHaveBeenCalled()
    expect(orchestrator.getState().status).toBe('offline')
    network.setOnline(true)
    network.setOnline(true)
    await settle()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('cancela el temporizador al quedar offline y el manual hace short-circuit', async () => {
    const execute = vi.fn().mockResolvedValue(failure('network', true))
    const { orchestrator, network, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    expect(scheduler.tasks.size).toBe(1)
    network.setOnline(false)
    expect(scheduler.tasks.size).toBe(0)
    expect(await orchestrator.syncNow()).toBeNull()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('usa backoff 1s, 2s, 4s y conserva un solo temporizador', async () => {
    const execute = vi.fn().mockResolvedValue(failure('server', true, '503'))
    const { orchestrator, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    expect(scheduler.nextDelay()).toBe(1_000)
    scheduler.advance(1_000)
    await settle()
    expect(scheduler.nextDelay()).toBe(2_000)
    expect(scheduler.tasks.size).toBe(1)
    scheduler.advance(2_000)
    await settle()
    expect(scheduler.nextDelay()).toBe(4_000)
  })

  it('limita los reintentos automáticos a diez', async () => {
    const execute = vi.fn().mockResolvedValue(failure('network', true))
    const { orchestrator, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    for (let retry = 0; retry < 10; retry += 1) {
      const delay = scheduler.nextDelay()
      expect(delay).not.toBeNull()
      scheduler.advance(delay ?? 0)
      await settle()
    }
    expect(execute).toHaveBeenCalledTimes(11)
    expect(scheduler.tasks.size).toBe(0)
    expect(orchestrator.getState().retryCount).toBe(11)
  })

  it('no reintenta errores no transitorios y permite intento manual', async () => {
    const execute = vi.fn().mockResolvedValue(failure('validation', false))
    const { orchestrator, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    expect(scheduler.tasks.size).toBe(0)
    expect(orchestrator.getState()).toMatchObject({
      status: 'error',
      canRetryManually: true,
      error: {
        kind: 'validation',
        message:
          'Hay datos locales que necesitan revisión antes de sincronizar.',
      },
    })
  })

  it('cancela el retry cuando la cola queda vacía', async () => {
    const execute = vi.fn().mockResolvedValue(failure('network', true))
    const { orchestrator, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    expect(scheduler.tasks.size).toBe(1)
    queue.emit(OWNER_A, 0)
    expect(scheduler.tasks.size).toBe(0)
    expect(orchestrator.getState().nextRetryAt).toBeNull()
  })

  it('el intento manual cancela el retry y reinicia el estado tras éxito', async () => {
    const execute = vi
      .fn<(ownerId: string) => Promise<SyncResult>>()
      .mockResolvedValueOnce(failure('network', true))
      .mockResolvedValueOnce(success())
    const { orchestrator, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    expect(scheduler.tasks.size).toBe(1)
    queue.emit(OWNER_A, 0)
    await orchestrator.syncNow()
    expect(scheduler.tasks.size).toBe(0)
    expect(orchestrator.getState()).toMatchObject({
      status: 'up_to_date',
      retryCount: 0,
      error: null,
    })
  })

  it('cambia de propietario, cancela suscripciones e ignora el resultado anterior', async () => {
    const oldAttempt = deferred<SyncResult>()
    const execute = vi
      .fn<(ownerId: string) => Promise<SyncResult>>()
      .mockReturnValueOnce(oldAttempt.promise)
      .mockResolvedValue(success())
    const { orchestrator, queue } = setup({ execute })
    orchestrator.start(OWNER_A)
    orchestrator.setOwner(OWNER_B)
    await settle()
    expect(queue.listenerCount(OWNER_A)).toBe(0)
    expect(queue.listenerCount(OWNER_B)).toBe(1)
    oldAttempt.resolve(failure('permission_denied', false))
    await settle()
    expect(orchestrator.getState().ownerId).toBe(OWNER_B)
    expect(orchestrator.getState().error).toBeNull()
  })

  it('limpia listeners y temporizadores al detenerse', async () => {
    const execute = vi.fn().mockResolvedValue(failure('network', true))
    const { orchestrator, network, queue, scheduler } = setup({ execute })
    queue.emit(OWNER_A, 1)
    orchestrator.start(OWNER_A)
    await settle()
    orchestrator.stop()
    expect(network.listenerCount()).toBe(0)
    expect(queue.listenerCount(OWNER_A)).toBe(0)
    expect(scheduler.tasks.size).toBe(0)
    expect(orchestrator.getState().ownerId).toBeNull()
  })
})

describe('calculateBackoffDelay', () => {
  it('aplica jitter inyectable y nunca supera 60 segundos', () => {
    expect(calculateBackoffDelay(1, DEFAULT_SYNC_RETRY_CONFIG, () => 0)).toBe(
      800,
    )
    expect(calculateBackoffDelay(1, DEFAULT_SYNC_RETRY_CONFIG, () => 1)).toBe(
      1_200,
    )
    expect(calculateBackoffDelay(20, DEFAULT_SYNC_RETRY_CONFIG, () => 1)).toBe(
      60_000,
    )
  })
})
