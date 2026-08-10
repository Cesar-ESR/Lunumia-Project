import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import {
  Network,
  type ConnectionStatus,
  type NetworkPlugin,
} from '@capacitor/network'
import type { NetworkStatusProvider } from '@application/services/SyncOrchestrator'
import { NativePlatformError } from '@infrastructure/platform/NativePlatformError'

type NetworkPort = Pick<NetworkPlugin, 'getStatus' | 'addListener'>
type AppPort = {
  addListener(
    eventName: 'appStateChange',
    listener: (state: { isActive: boolean }) => void,
  ): Promise<PluginListenerHandle>
}

export class CapacitorNetworkStatusProvider implements NetworkStatusProvider {
  private online = false
  private connectionType: ConnectionStatus['connectionType'] = 'unknown'
  private statusVersion = 0
  private refreshPromise: Promise<boolean> | null = null
  private listenerGeneration = 0
  private networkListener: Promise<PluginListenerHandle> | null = null
  private appListener: Promise<PluginListenerHandle> | null = null
  private readonly consumers = new Set<(online: boolean) => void>()

  constructor(
    private readonly network: NetworkPort = Network,
    private readonly app: AppPort = App,
  ) {
    void this.refresh().catch(() => undefined)
  }

  isOnline(): boolean {
    return this.online
  }

  async getNetworkStatus(): Promise<boolean> {
    try {
      return await this.refresh()
    } catch (reason) {
      throw new NativePlatformError(
        'network_listener_failed',
        reason instanceof Error ? { cause: reason } : undefined,
      )
    }
  }

  getStatusSnapshot(): ConnectionStatus {
    return {
      connected: this.online,
      connectionType: this.connectionType,
    }
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.consumers.add(listener)
    if (this.consumers.size === 1) this.startListening()
    void this.refresh().catch(() => undefined)

    return () => {
      if (!this.consumers.delete(listener)) return
      if (this.consumers.size === 0) this.stopListening()
    }
  }

  onNetworkChange(listener: (online: boolean) => void): () => void {
    return this.subscribe(listener)
  }

  private refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise
    const versionAtStart = this.statusVersion
    const operation = this.network
      .getStatus()
      .then((status) => {
        if (versionAtStart === this.statusVersion) this.publish(status)
        return this.online
      })
      .finally(() => {
        if (this.refreshPromise === operation) this.refreshPromise = null
      })
    this.refreshPromise = operation
    return operation
  }

  private startListening(): void {
    if (this.networkListener || this.appListener) return
    const generation = ++this.listenerGeneration
    this.networkListener = this.network.addListener(
      'networkStatusChange',
      (status) => {
        if (generation !== this.listenerGeneration) return
        this.statusVersion += 1
        this.publish(status)
      },
    )
    this.appListener = this.app.addListener(
      'appStateChange',
      ({ isActive }) => {
        if (generation !== this.listenerGeneration || !isActive) return
        void this.refresh().catch(() => undefined)
      },
    )
    void this.networkListener.catch(() => undefined)
    void this.appListener.catch(() => undefined)
  }

  private stopListening(): void {
    this.listenerGeneration += 1
    const handles = [this.networkListener, this.appListener]
    this.networkListener = null
    this.appListener = null
    handles.forEach((handle) => {
      void handle?.then((listener) => listener.remove()).catch(() => undefined)
    })
  }

  private publish(status: ConnectionStatus): void {
    this.connectionType = status.connectionType
    if (status.connected === this.online) return
    this.online = status.connected
    this.consumers.forEach((listener) => listener(status.connected))
  }
}
