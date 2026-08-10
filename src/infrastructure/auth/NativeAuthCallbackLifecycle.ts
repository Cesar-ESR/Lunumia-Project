import {
  App,
  type AppLaunchUrl,
  type URLOpenListenerEvent,
} from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import type {
  AuthCodeExchangeResult,
  AuthSession,
} from '@application/services/AuthClient'
import { parseAuthCallbackUrl } from './AuthCallbackUrl'

interface AppUrlPort {
  getLaunchUrl(): Promise<AppLaunchUrl | undefined>
  addListener(
    eventName: 'appUrlOpen',
    listener: (event: URLOpenListenerEvent) => void,
  ): Promise<PluginListenerHandle>
}

interface AuthCodeExchanger {
  exchangeCodeForSession(
    code: string,
    flowId?: string,
  ): Promise<AuthCodeExchangeResult>
}

export interface AuthCallbackHandlers {
  onSuccess(session: AuthSession, destination: string): void
  onError(message: string): void
}

const callbackErrorMessage =
  'No fue posible completar la autenticación. Solicita un enlace nuevo e inténtalo otra vez.'

export class NativeAuthCallbackLifecycle {
  private activeGeneration = 0
  private started = false
  private listener: Promise<PluginListenerHandle> | null = null
  private readonly processedCodes = new Set<string>()

  constructor(
    private readonly auth: AuthCodeExchanger,
    private readonly app: AppUrlPort = App,
  ) {}

  start(handlers: AuthCallbackHandlers): () => void {
    if (this.started) return () => undefined
    this.started = true
    const generation = ++this.activeGeneration
    this.listener = this.app.addListener('appUrlOpen', ({ url }) => {
      void this.process(url, handlers, generation)
    })
    void this.listener.catch(() => {
      if (this.isActive(generation)) handlers.onError(callbackErrorMessage)
    })
    void this.app
      .getLaunchUrl()
      .then((launch) => {
        if (launch && this.isActive(generation))
          return this.process(launch.url, handlers, generation)
      })
      .catch(() => {
        if (this.isActive(generation)) handlers.onError(callbackErrorMessage)
      })

    return () => this.stop(generation)
  }

  private stop(generation: number): void {
    if (!this.isActive(generation)) return
    this.started = false
    this.activeGeneration += 1
    const listener = this.listener
    this.listener = null
    if (listener)
      void listener.then((handle) => handle.remove()).catch(() => undefined)
  }

  private async process(
    url: string,
    handlers: AuthCallbackHandlers,
    generation: number,
  ): Promise<void> {
    const callback = parseAuthCallbackUrl(url)
    if (!callback) return
    if (callback.kind === 'error') {
      if (this.isActive(generation)) handlers.onError(callbackErrorMessage)
      return
    }
    if (this.processedCodes.has(callback.code)) return
    this.processedCodes.add(callback.code)
    try {
      const result = await this.auth.exchangeCodeForSession(
        callback.code,
        callback.flowId ?? undefined,
      )
      if (!this.isActive(generation)) return
      handlers.onSuccess(
        result.session,
        result.kind === 'recovery' ? '/reset-password' : '/dashboard',
      )
    } catch {
      if (this.isActive(generation)) handlers.onError(callbackErrorMessage)
    }
  }

  private isActive(generation: number): boolean {
    return this.started && generation === this.activeGeneration
  }
}
