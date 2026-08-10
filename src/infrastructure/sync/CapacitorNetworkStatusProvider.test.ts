import { describe, expect, it, vi } from 'vitest'
import { SyncOrchestrator } from '@application/services/SyncOrchestrator'
import { CapacitorNetworkStatusProvider } from './CapacitorNetworkStatusProvider'

function setup(initiallyConnected = false) {
  let connected = initiallyConnected
  let nativeListener:
    | ((status: {
        connected: boolean
        connectionType: 'wifi' | 'none'
      }) => void)
    | null = null
  let appStateListener: ((state: { isActive: boolean }) => void) | null = null
  const removeNetwork = vi.fn(async () => undefined)
  const removeApp = vi.fn(async () => undefined)
  const network = {
    getStatus: vi.fn(async () => ({
      connected,
      connectionType: connected ? ('wifi' as const) : ('none' as const),
    })),
    addListener: vi.fn(
      async (
        _event: 'networkStatusChange',
        listener: (status: {
          connected: boolean
          connectionType: 'wifi' | 'none'
        }) => void,
      ) => {
        nativeListener = listener
        return { remove: removeNetwork }
      },
    ),
  }
  const app = {
    addListener: vi.fn(
      async (
        _event: 'appStateChange',
        listener: (state: { isActive: boolean }) => void,
      ) => {
        appStateListener = listener
        return { remove: removeApp }
      },
    ),
  }
  const provider = new CapacitorNetworkStatusProvider(network, app)
  return {
    provider,
    network,
    app,
    removeNetwork,
    removeApp,
    setConnected: (next: boolean) => {
      connected = next
    },
    emitNetwork: (next: boolean) =>
      nativeListener?.({
        connected: next,
        connectionType: next ? 'wifi' : 'none',
      }),
    emitAppState: (isActive: boolean) => appStateListener?.({ isActive }),
  }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function createOrchestrator(provider: CapacitorNetworkStatusProvider) {
  const sync = vi.fn(async () => ({
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
    startedAt: '2026-08-08T00:00:00.000Z',
    finishedAt: '2026-08-08T00:00:01.000Z',
    errors: [],
  }))
  const orchestrator = new SyncOrchestrator(
    { sync },
    { count: async () => 1, subscribe: () => () => undefined },
    provider,
    {
      now: () => 1_800_000_000_000,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    },
  )
  return { orchestrator, sync }
}

describe('CapacitorNetworkStatusProvider', () => {
  it('publica el startup Android online y conserva el connectionType real', async () => {
    const { provider, network } = setup(true)
    const listener = vi.fn()
    const unsubscribe = provider.subscribe(listener)

    expect(provider.isOnline()).toBe(false)
    await expect(provider.getNetworkStatus()).resolves.toBe(true)
    expect(network.getStatus).toHaveBeenCalledOnce()
    expect(provider.getStatusSnapshot()).toEqual({
      connected: true,
      connectionType: 'wifi',
    })
    expect(listener).toHaveBeenCalledWith(true)
    unsubscribe()
  })

  it('propaga startup offline seguido por networkStatusChange online', async () => {
    const { provider, emitNetwork } = setup(false)
    const listener = vi.fn()
    const unsubscribe = provider.subscribe(listener)
    await provider.getNetworkStatus()

    expect(provider.getStatusSnapshot()).toEqual({
      connected: false,
      connectionType: 'none',
    })
    emitNetwork(true)
    emitNetwork(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(true)
    unsubscribe()
  })

  it('reconsulta Network.getStatus al volver a foreground', async () => {
    const { provider, network, setConnected, emitAppState } = setup(false)
    await provider.getNetworkStatus()
    const listener = vi.fn()
    const unsubscribe = provider.subscribe(listener)
    await settle()
    const callsBeforeForeground = network.getStatus.mock.calls.length

    setConnected(true)
    emitAppState(false)
    await settle()
    expect(network.getStatus).toHaveBeenCalledTimes(callsBeforeForeground)
    emitAppState(true)
    await settle()

    expect(network.getStatus).toHaveBeenCalledTimes(callsBeforeForeground + 1)
    expect(listener).toHaveBeenCalledWith(true)
    expect(provider.isOnline()).toBe(true)
    unsubscribe()
  })

  it('comparte listeners nativos y los elimina al cancelar el último consumidor', async () => {
    const { provider, network, app, removeNetwork, removeApp, emitNetwork } =
      setup(false)
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = provider.subscribe(first)
    const unsubscribeSecond = provider.subscribe(second)
    await settle()

    expect(network.addListener).toHaveBeenCalledOnce()
    expect(app.addListener).toHaveBeenCalledOnce()
    emitNetwork(true)
    expect(first).toHaveBeenCalledWith(true)
    expect(second).toHaveBeenCalledWith(true)
    unsubscribeFirst()
    await settle()
    expect(removeNetwork).not.toHaveBeenCalled()
    unsubscribeSecond()
    await settle()
    expect(removeNetwork).toHaveBeenCalledOnce()
    expect(removeApp).toHaveBeenCalledOnce()
    emitNetwork(false)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('no deja a React atrapado en false si getStatus resolvió antes del montaje', async () => {
    const { provider } = setup(true)
    await expect(provider.getNetworkStatus()).resolves.toBe(true)
    const { orchestrator } = createOrchestrator(provider)

    orchestrator.start('11111111-1111-4111-8111-111111111111')
    expect(orchestrator.getState().isOnline).toBe(true)
    orchestrator.stop()
  })

  it('la transición nativa offline→online reutiliza SyncOrchestrator una vez', async () => {
    const { provider, emitNetwork } = setup(false)
    await provider.getNetworkStatus()
    const { orchestrator, sync } = createOrchestrator(provider)
    orchestrator.start('11111111-1111-4111-8111-111111111111')
    await settle()
    expect(sync).not.toHaveBeenCalled()

    emitNetwork(true)
    emitNetwork(true)
    await settle()
    expect(sync).toHaveBeenCalledTimes(1)
    orchestrator.stop()
  })
})
