import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SyncErrorKind, SyncResult } from './SyncCoordinator'
import {
  SyncOrchestrator,
  type NetworkStatusProvider,
  type SyncQueueObserver,
  type SyncScheduler,
} from './SyncOrchestrator'

const OWNER_A = '11111111-1111-4111-8111-111111111111'
const OWNER_B = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-08-01T12:00:00.000Z')

class ModelNetwork implements NetworkStatusProvider {
  private readonly listeners = new Set<(online: boolean) => void>()
  constructor(private online: boolean) {}
  isOnline(): boolean {
    return this.online
  }
  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  set(online: boolean): void {
    this.online = online
    this.listeners.forEach((listener) => listener(online))
  }
  get listenerCount(): number {
    return this.listeners.size
  }
}

class ModelQueue implements SyncQueueObserver {
  private readonly counts = new Map<string, number>()
  private readonly listeners = new Map<string, Set<(count: number) => void>>()
  async count(ownerId: string): Promise<number> {
    return this.counts.get(ownerId) ?? 0
  }
  subscribe(ownerId: string, listener: (count: number) => void): () => void {
    const ownerListeners = this.listeners.get(ownerId) ?? new Set()
    ownerListeners.add(listener)
    this.listeners.set(ownerId, ownerListeners)
    return () => ownerListeners.delete(listener)
  }
  emit(ownerId: string, count: number): void {
    this.counts.set(ownerId, count)
    this.listeners.get(ownerId)?.forEach((listener) => listener(count))
  }
  listenerCount(ownerId: string): number {
    return this.listeners.get(ownerId)?.size ?? 0
  }
}

class ModelScheduler implements SyncScheduler {
  private sequence = 0
  readonly tasks = new Map<number, () => void>()
  now(): number {
    return NOW
  }
  setTimeout(callback: () => void): unknown {
    const id = ++this.sequence
    this.tasks.set(id, callback)
    return id
  }
  clearTimeout(timer: unknown): void {
    if (typeof timer === 'number') this.tasks.delete(timer)
  }
}

function result(error?: {
  kind: SyncErrorKind
  retryable: boolean
}): SyncResult {
  return {
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    failed: error ? 1 : 0,
    startedAt: new Date(NOW).toISOString(),
    finishedAt: new Date(NOW + 1).toISOString(),
    errors: error
      ? [
          {
            stage: 'upload',
            kind: error.kind,
            code: 'generated_error',
            retryable: error.retryable,
            message: 'secret token technical detail',
          },
        ]
      : [],
  }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

type ModelEvent =
  | { type: 'owner'; value: 'a' | 'b' | 'guest' | 'none' }
  | { type: 'network'; online: boolean }
  | { type: 'enqueue'; owner: 'a' | 'b'; count: number }
  | { type: 'manual' }
  | { type: 'stop' }

const eventArbitrary: fc.Arbitrary<ModelEvent> = fc.oneof(
  fc.record({
    type: fc.constant('owner' as const),
    value: fc.constantFrom(
      'a' as const,
      'b' as const,
      'guest' as const,
      'none' as const,
    ),
  }),
  fc.record({ type: fc.constant('network' as const), online: fc.boolean() }),
  fc.record({
    type: fc.constant('enqueue' as const),
    owner: fc.constantFrom('a' as const, 'b' as const),
    count: fc.integer({ min: 0, max: 20 }),
  }),
  fc.constant({ type: 'manual' as const }),
  fc.constant({ type: 'stop' as const }),
)

describe('propiedades del orquestador de sincronización', () => {
  it('PBT: respeta retryable, mantiene un solo timer y sanitiza detalles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SyncErrorKind>(
          'network',
          'unauthenticated',
          'permission_denied',
          'validation',
          'conflict',
          'server',
          'unknown',
        ),
        fc.boolean(),
        async (kind, retryable) => {
          const network = new ModelNetwork(true)
          const queue = new ModelQueue()
          const scheduler = new ModelScheduler()
          queue.emit(OWNER_A, 1)
          const orchestrator = new SyncOrchestrator(
            { sync: async () => result({ kind, retryable }) },
            queue,
            network,
            scheduler,
          )
          orchestrator.start(OWNER_A)
          await settle()
          expect(scheduler.tasks.size).toBe(retryable ? 1 : 0)
          expect(orchestrator.getState().error).toMatchObject({
            kind,
            retryable,
          })
          expect(orchestrator.getState().error?.message).not.toMatch(
            /secret|token/i,
          )
          orchestrator.stop()
          expect(scheduler.tasks.size).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('PBT: N solicitudes concurrentes comparten una sola ejecución', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 50 }), async (requests) => {
        let complete!: (value: SyncResult) => void
        const pending = new Promise<SyncResult>((resolve) => {
          complete = resolve
        })
        let calls = 0
        const orchestrator = new SyncOrchestrator(
          {
            sync: () => {
              calls += 1
              return pending
            },
          },
          new ModelQueue(),
          new ModelNetwork(true),
          new ModelScheduler(),
        )
        orchestrator.start(OWNER_A)
        const executions = Array.from({ length: requests }, () =>
          orchestrator.syncNow(),
        )
        expect(new Set(executions).size).toBe(1)
        expect(calls).toBe(1)
        complete(result())
        await Promise.all(executions)
        orchestrator.stop()
      }),
      { numRuns: 100 },
    )
  })

  it('PBT de secuencias: sesión, red, cola y cleanup respetan el modelo', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(eventArbitrary, { minLength: 1, maxLength: 40 }),
        async (events) => {
          const network = new ModelNetwork(true)
          const queue = new ModelQueue()
          const scheduler = new ModelScheduler()
          const calls: string[] = []
          const orchestrator = new SyncOrchestrator(
            {
              sync: async (ownerId) => {
                calls.push(ownerId)
                return result()
              },
            },
            queue,
            network,
            scheduler,
          )
          let started = false
          for (const event of events) {
            if (event.type === 'owner') {
              const selected =
                event.value === 'a'
                  ? OWNER_A
                  : event.value === 'b'
                    ? OWNER_B
                    : event.value === 'guest'
                      ? 'guest:generated'
                      : null
              if (started) orchestrator.setOwner(selected)
              else {
                orchestrator.start(selected)
                started = true
              }
            } else if (event.type === 'network') {
              network.set(event.online)
            } else if (event.type === 'enqueue') {
              queue.emit(event.owner === 'a' ? OWNER_A : OWNER_B, event.count)
            } else if (event.type === 'manual') {
              await orchestrator.syncNow()
            } else {
              orchestrator.stop()
              started = false
            }
            await settle()
            const activeOwner = orchestrator.getState().ownerId
            expect(
              activeOwner === null ||
                activeOwner === OWNER_A ||
                activeOwner === OWNER_B,
            ).toBe(true)
            expect(
              queue.listenerCount(OWNER_A) + queue.listenerCount(OWNER_B),
            ).toBe(activeOwner === null ? 0 : 1)
            expect(network.listenerCount).toBe(started ? 1 : 0)
            expect(scheduler.tasks.size).toBeLessThanOrEqual(1)
            expect(
              calls.every((owner) => owner === OWNER_A || owner === OWNER_B),
            ).toBe(true)
          }
          orchestrator.stop()
          expect(network.listenerCount).toBe(0)
          expect(
            queue.listenerCount(OWNER_A) + queue.listenerCount(OWNER_B),
          ).toBe(0)
          expect(scheduler.tasks.size).toBe(0)
        },
      ),
      { numRuns: 50 },
    )
  })
})
