import { App, type AppState } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'

interface NativeAppStatePort {
  getState(): Promise<AppState>
  addListener(
    eventName: 'appStateChange',
    listener: (state: AppState) => void,
  ): Promise<PluginListenerHandle>
}

interface AutoRefreshPort {
  startAutoRefresh(): void
  stopAutoRefresh(): void
}

export interface NativeAuthSessionHandlers {
  onForeground(): Promise<void>
}

function logLifecycle(state: 'foreground' | 'background'): void {
  if (import.meta.env.DEV) console.info(`[auth] lifecycle=${state}`)
}

export class NativeAuthSessionLifecycle {
  private activeGeneration = 0
  private started = false
  private currentActive: boolean | null = null
  private listener: Promise<PluginListenerHandle | null> | null = null
  private transition = Promise.resolve()

  constructor(
    private readonly auth: AutoRefreshPort,
    private readonly app: NativeAppStatePort = App,
  ) {}

  start(handlers: NativeAuthSessionHandlers): () => void {
    if (this.started) return () => undefined
    this.started = true
    this.currentActive = null
    const generation = ++this.activeGeneration
    this.listener = this.initialize(handlers, generation)
    return () => this.stop(generation)
  }

  private async initialize(
    handlers: NativeAuthSessionHandlers,
    generation: number,
  ): Promise<PluginListenerHandle | null> {
    try {
      const state = await this.app.getState()
      if (!this.isActive(generation)) return null
      await this.enqueue(state.isActive, handlers, generation)
      if (!this.isActive(generation)) return null
      return await this.app.addListener('appStateChange', (nextState) => {
        void this.enqueue(nextState.isActive, handlers, generation)
      })
    } catch {
      return null
    }
  }

  private enqueue(
    isActive: boolean,
    handlers: NativeAuthSessionHandlers,
    generation: number,
  ): Promise<void> {
    this.transition = this.transition
      .then(() => this.apply(isActive, handlers, generation))
      .catch(() => undefined)
    return this.transition
  }

  private async apply(
    isActive: boolean,
    handlers: NativeAuthSessionHandlers,
    generation: number,
  ): Promise<void> {
    if (!this.isActive(generation) || this.currentActive === isActive) return
    this.currentActive = isActive
    if (isActive) {
      logLifecycle('foreground')
      this.auth.startAutoRefresh()
      await handlers.onForeground()
      return
    }
    logLifecycle('background')
    this.auth.stopAutoRefresh()
  }

  private stop(generation: number): void {
    if (!this.isActive(generation)) return
    this.started = false
    this.currentActive = null
    this.activeGeneration += 1
    const listener = this.listener
    this.listener = null
    if (listener)
      void listener.then((handle) => handle?.remove()).catch(() => undefined)
  }

  private isActive(generation: number): boolean {
    return this.started && generation === this.activeGeneration
  }
}
