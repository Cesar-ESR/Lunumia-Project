import { describe, expect, it } from 'vitest'
import { CapacitorNetworkStatusProvider } from '@infrastructure/sync/CapacitorNetworkStatusProvider'
import { WebNetworkStatusProvider } from '@infrastructure/sync/WebNetworkStatusProvider'
import {
  CapacitorExternalUrlProvider,
  CapacitorPlatformAdapter,
  WebExternalUrlProvider,
  WebPlatformAdapter,
} from '@infrastructure/platform'
import { NativeAuthCallbackLifecycle } from '@infrastructure/auth/NativeAuthCallbackLifecycle'
import { NativeAuthSessionLifecycle } from '@infrastructure/auth/NativeAuthSessionLifecycle'
import {
  createNativeAuthLifecycles,
  createPlatformServices,
} from './composition-root'

describe('platform service selection', () => {
  it('web conserva los adaptadores del navegador', () => {
    const services = createPlatformServices(false)
    expect(services.receiptImages).toBeInstanceOf(WebPlatformAdapter)
    expect(services.network).toBeInstanceOf(WebNetworkStatusProvider)
    expect(services.externalUrls).toBeInstanceOf(WebExternalUrlProvider)
  })

  it('Android selecciona Camera, Network y Browser de Capacitor', () => {
    const services = createPlatformServices(true)
    expect(services.receiptImages).toBeInstanceOf(CapacitorPlatformAdapter)
    expect(services.network).toBeInstanceOf(CapacitorNetworkStatusProvider)
    expect(services.externalUrls).toBeInstanceOf(CapacitorExternalUrlProvider)
  })

  it('compone lifecycles Auth nativos separados solo para Android', () => {
    const authClient = {} as never
    const native = createNativeAuthLifecycles(authClient, true)
    expect(native.authCallbacks).toBeInstanceOf(NativeAuthCallbackLifecycle)
    expect(native.authSessionLifecycle).toBeInstanceOf(
      NativeAuthSessionLifecycle,
    )
    expect(createNativeAuthLifecycles(authClient, false)).toEqual({
      authCallbacks: null,
      authSessionLifecycle: null,
    })
  })
})
