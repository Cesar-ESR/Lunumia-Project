import { describe, expect, it, vi } from 'vitest'
import type {
  AuthCodeExchangeResult,
  AuthSession,
} from '@application/services/AuthClient'
import { NativeAuthCallbackLifecycle } from './NativeAuthCallbackLifecycle'

const session: AuthSession = {
  user: { id: 'user-id', email: 'person@example.com' },
  expiresAt: 1_800_000_000,
}

function setup(launchUrl?: string) {
  let warmListener: ((event: { url: string }) => void) | null = null
  const remove = vi.fn(async () => undefined)
  const app = {
    getLaunchUrl: vi.fn(async () =>
      launchUrl === undefined ? undefined : { url: launchUrl },
    ),
    addListener: vi.fn(
      async (
        _event: 'appUrlOpen',
        listener: (event: { url: string }) => void,
      ) => {
        warmListener = listener
        return { remove }
      },
    ),
  }
  const auth = {
    exchangeCodeForSession: vi
      .fn<() => Promise<AuthCodeExchangeResult>>()
      .mockResolvedValue({ session, kind: 'authentication' }),
  }
  const handlers = { onSuccess: vi.fn(), onError: vi.fn() }
  const lifecycle = new NativeAuthCallbackLifecycle(auth, app)
  return {
    lifecycle,
    auth,
    app,
    handlers,
    remove,
    emit: (url: string) => warmListener?.({ url }),
  }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('NativeAuthCallbackLifecycle', () => {
  it('procesa el callback de arranque frío', async () => {
    const setupResult = setup(
      'com.gastoclaro.app://auth/callback?code=cold-code',
    )
    setupResult.lifecycle.start(setupResult.handlers)
    await settle()
    expect(setupResult.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'cold-code',
      undefined,
    )
    expect(setupResult.handlers.onSuccess).toHaveBeenCalledWith(
      session,
      '/dashboard',
    )
  })

  it('procesa warm start y navega a recuperación según Supabase', async () => {
    const setupResult = setup()
    setupResult.auth.exchangeCodeForSession.mockResolvedValue({
      session,
      kind: 'recovery',
    })
    setupResult.lifecycle.start(setupResult.handlers)
    await settle()
    setupResult.emit(
      'com.gastoclaro.app://auth/callback?code=warm-code&sb_flow_id=abcdefgh',
    )
    await settle()
    expect(setupResult.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'warm-code',
      'abcdefgh',
    )
    expect(setupResult.handlers.onSuccess).toHaveBeenCalledWith(
      session,
      '/reset-password',
    )
  })

  it('no intercambia dos veces el mismo código recibido por cold y warm start', async () => {
    const url = 'com.gastoclaro.app://auth/callback?code=same-code'
    const setupResult = setup(url)
    setupResult.lifecycle.start(setupResult.handlers)
    await settle()
    setupResult.emit(url)
    await settle()
    expect(setupResult.auth.exchangeCodeForSession).toHaveBeenCalledOnce()
    expect(setupResult.handlers.onSuccess).toHaveBeenCalledOnce()
  })

  it('ignora URLs ajenas y no registra credenciales ni errores técnicos', async () => {
    const setupResult = setup()
    setupResult.lifecycle.start(setupResult.handlers)
    await settle()
    setupResult.emit('javascript:alert(1)')
    await settle()
    expect(setupResult.auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(setupResult.handlers.onError).not.toHaveBeenCalled()
  })

  it('traduce fallos y elimina el listener al detenerse', async () => {
    const setupResult = setup()
    setupResult.auth.exchangeCodeForSession.mockRejectedValue(
      new Error('access_token=secret internal endpoint'),
    )
    const stop = setupResult.lifecycle.start(setupResult.handlers)
    await settle()
    setupResult.emit('com.gastoclaro.app://auth/callback?code=failed-code')
    await settle()
    expect(setupResult.handlers.onError).toHaveBeenCalledWith(
      'No fue posible completar la autenticación. Solicita un enlace nuevo e inténtalo otra vez.',
    )
    expect(setupResult.handlers.onError.mock.calls[0]?.[0]).not.toContain(
      'secret',
    )
    stop()
    await settle()
    expect(setupResult.remove).toHaveBeenCalledOnce()
  })
})
