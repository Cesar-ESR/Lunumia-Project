import type { AppState } from '@capacitor/app'
import { describe, expect, it, vi } from 'vitest'
import { NativeAuthSessionLifecycle } from './NativeAuthSessionLifecycle'

function setup(initiallyActive: boolean) {
  let appStateListener: ((state: AppState) => void) | null = null
  const remove = vi.fn(async () => undefined)
  const app = {
    getState: vi.fn(async () => ({ isActive: initiallyActive })),
    addListener: vi.fn(
      async (
        _eventName: 'appStateChange',
        listener: (state: AppState) => void,
      ) => {
        appStateListener = listener
        return { remove }
      },
    ),
  }
  const auth = {
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn(),
  }
  const onForeground = vi.fn(async () => undefined)
  const lifecycle = new NativeAuthSessionLifecycle(auth, app)
  return {
    app,
    auth,
    lifecycle,
    onForeground,
    remove,
    emit: (isActive: boolean) => appStateListener?.({ isActive }),
  }
}

describe('NativeAuthSessionLifecycle', () => {
  it('estado inicial activo inicia auto refresh y espera revalidación', async () => {
    const current = setup(true)
    current.lifecycle.start({ onForeground: current.onForeground })
    await vi.waitFor(() => {
      expect(current.auth.startAutoRefresh).toHaveBeenCalledOnce()
      expect(current.onForeground).toHaveBeenCalledOnce()
      expect(current.app.addListener).toHaveBeenCalledOnce()
    })
    expect(
      current.auth.startAutoRefresh.mock.invocationCallOrder[0],
    ).toBeLessThan(current.onForeground.mock.invocationCallOrder[0]!)
  })

  it('estado inicial inactivo detiene auto refresh', async () => {
    const current = setup(false)
    current.lifecycle.start({ onForeground: current.onForeground })
    await vi.waitFor(() =>
      expect(current.auth.stopAutoRefresh).toHaveBeenCalledOnce(),
    )
    expect(current.auth.startAutoRefresh).not.toHaveBeenCalled()
    expect(current.onForeground).not.toHaveBeenCalled()
  })

  it('background y foreground ejecutan cada transición exactamente una vez', async () => {
    const current = setup(true)
    current.lifecycle.start({ onForeground: current.onForeground })
    await vi.waitFor(() => expect(current.app.addListener).toHaveBeenCalled())
    current.emit(false)
    current.emit(false)
    await vi.waitFor(() =>
      expect(current.auth.stopAutoRefresh).toHaveBeenCalledOnce(),
    )
    current.emit(true)
    current.emit(true)
    await vi.waitFor(() => {
      expect(current.auth.startAutoRefresh).toHaveBeenCalledTimes(2)
      expect(current.onForeground).toHaveBeenCalledTimes(2)
    })
  })

  it('cleanup elimina el listener appStateChange y no procesa más eventos', async () => {
    const current = setup(true)
    const cleanup = current.lifecycle.start({
      onForeground: current.onForeground,
    })
    await vi.waitFor(() => expect(current.app.addListener).toHaveBeenCalled())
    cleanup()
    await vi.waitFor(() => expect(current.remove).toHaveBeenCalledOnce())
    current.emit(false)
    await Promise.resolve()
    expect(current.auth.stopAutoRefresh).not.toHaveBeenCalled()
  })
})
