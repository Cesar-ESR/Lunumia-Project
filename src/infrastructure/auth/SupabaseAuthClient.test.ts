import {
  createClient,
  type AuthSession as SupabaseSession,
  type AuthUser as SupabaseUser,
} from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthClientError } from '@application/services/AuthClient'
import type { Database } from '@infrastructure/remote/database.types'
import { SupabaseAuthClient } from './SupabaseAuthClient'

const user: SupabaseUser = {
  id: '10000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'persona@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-08-01T00:00:00.000Z',
}

const session: SupabaseSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  expires_at: 1_800_000_000,
  token_type: 'bearer',
  user,
}

describe('SupabaseAuthClient', () => {
  const supabase = createClient<Database>(
    'https://example.supabase.co',
    'test-anon-key',
  )
  const client = new SupabaseAuthClient(supabase)

  beforeEach(() => vi.restoreAllMocks())

  it('registra y mapea una sesión inmediata', async () => {
    const signUp = vi
      .spyOn(supabase.auth, 'signUp')
      .mockResolvedValue({ data: { user, session }, error: null })
    const result = await client.signUp(
      {
        email: 'persona@example.com',
        password: '12345678',
        passwordConfirmation: '12345678',
      },
      'https://app.test/verify-email',
    )
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'persona@example.com',
        options: { emailRedirectTo: 'https://app.test/verify-email' },
      }),
    )
    expect(result).toEqual({
      user: { id: user.id, email: user.email },
      session: {
        user: { id: user.id, email: user.email },
        expiresAt: session.expires_at,
      },
      requiresEmailVerification: false,
    })
  })

  it('mantiene ambiguo un signup aceptado sin sesión', async () => {
    vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({
      data: { user, session: null },
      error: null,
    })
    const result = await client.signUp({
      email: 'persona@example.com',
      password: '12345678',
      passwordConfirmation: '12345678',
    })

    expect(result).toMatchObject({
      user: { id: user.id },
      session: null,
      requiresEmailVerification: true,
    })
    expect(result).not.toHaveProperty('accountCreated')
  })

  it('clasifica un error de registro sin exponer el detalle', async () => {
    vi.spyOn(supabase.auth, 'signUp').mockRejectedValue(
      new Error('email already registered'),
    )
    await expect(
      client.signUp({
        email: 'persona@example.com',
        password: '12345678',
        passwordConfirmation: '12345678',
      }),
    ).rejects.toMatchObject({
      kind: 'authentication',
      message: 'No fue posible completar la autenticación.',
    })
  })

  it('inicia sesión y mapea el usuario mínimo', async () => {
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user, session },
      error: null,
    })
    await expect(
      client.signIn({ email: 'persona@example.com', password: '12345678' }),
    ).resolves.toMatchObject({
      session: { user: { id: user.id, email: user.email } },
    })
  })

  it('muestra un error genérico para login fallido', async () => {
    vi.spyOn(supabase.auth, 'signInWithPassword').mockRejectedValue(
      new Error('invalid credentials'),
    )
    await expect(
      client.signIn({ email: 'persona@example.com', password: 'incorrecta' }),
    ).rejects.toBeInstanceOf(AuthClientError)
  })

  it('cierra sesión', async () => {
    const signOut = vi
      .spyOn(supabase.auth, 'signOut')
      .mockResolvedValue({ error: null })
    await client.signOut()
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('solicita recuperación con redirect', async () => {
    const reset = vi
      .spyOn(supabase.auth, 'resetPasswordForEmail')
      .mockResolvedValue({ data: {}, error: null })
    await client.requestPasswordReset(
      'persona@example.com',
      'https://app.test/reset-password',
    )
    expect(reset).toHaveBeenCalledWith('persona@example.com', {
      redirectTo: 'https://app.test/reset-password',
    })
  })

  it('actualiza la contraseña de la sesión de recuperación', async () => {
    const update = vi
      .spyOn(supabase.auth, 'updateUser')
      .mockResolvedValue({ data: { user }, error: null })
    await client.updatePassword('nueva-clave')
    expect(update).toHaveBeenCalledWith({ password: 'nueva-clave' })
  })

  it('intercambia un código PKCE, conserva flowId y limpia el listener temporal', async () => {
    let authCallback:
      Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    const unsubscribe = vi.fn()
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation(
      (callback) => {
        authCallback = callback
        return { data: { subscription: { id: 'pkce', callback, unsubscribe } } }
      },
    )
    const exchange = vi
      .spyOn(supabase.auth, 'exchangeCodeForSession')
      .mockImplementation(async () => {
        await authCallback?.('PASSWORD_RECOVERY', session)
        return { data: { user, session }, error: null }
      })

    await expect(
      client.exchangeCodeForSession('one-time-code', 'abcdefgh'),
    ).resolves.toEqual({ session: expect.any(Object), kind: 'recovery' })
    expect(exchange).toHaveBeenCalledWith('one-time-code', {
      flowId: 'abcdefgh',
    })
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('restaura una sesión existente y acepta ausencia de sesión', async () => {
    const getSession = vi
      .spyOn(supabase.auth, 'getSession')
      .mockResolvedValueOnce({ data: { session }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(client.getSession()).resolves.toMatchObject({
      user: { id: user.id },
    })
    await expect(client.getSession()).resolves.toBeNull()
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('revalida con refreshSession real y conserva el mismo usuario', async () => {
    const refresh = vi
      .spyOn(supabase.auth, 'refreshSession')
      .mockResolvedValue({ data: { user, session }, error: null })
    await expect(client.revalidateSession()).resolves.toMatchObject({
      user: { id: user.id },
    })
    expect(refresh).toHaveBeenCalledWith()
  })

  it('distingue refresh token definitivamente inválido de un fallo temporal', async () => {
    vi.spyOn(supabase.auth, 'refreshSession')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(
        Object.assign(new Error('Refresh token not found'), {
          code: 'refresh_token_not_found',
          status: 400,
        }),
      )
    await expect(client.revalidateSession()).rejects.toMatchObject({
      kind: 'network',
    })
    await expect(client.revalidateSession()).rejects.toMatchObject({
      kind: 'session-invalid',
      code: 'refresh_token_not_found',
      status: 400,
    })
  })

  it('delega start/stop auto refresh sin exponer tokens', () => {
    const start = vi.spyOn(supabase.auth, 'startAutoRefresh')
    const stop = vi.spyOn(supabase.auth, 'stopAutoRefresh')
    client.startAutoRefresh()
    client.stopAutoRefresh()
    expect(start).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('propaga cambios de autenticación y elimina la suscripción', () => {
    const unsubscribe = vi.fn()
    const listener = vi.fn()
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation(
      (callback) => {
        callback('SIGNED_IN', session)
        return { data: { subscription: { id: 'test', callback, unsubscribe } } }
      },
    )
    const stop = client.onAuthStateChange(listener)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'signed-in',
        session: expect.objectContaining({
          user: expect.objectContaining({ id: user.id }),
        }),
      }),
    )
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('preserva los eventos Auth relevantes incluido TOKEN_REFRESHED', () => {
    let callback:
      Parameters<typeof supabase.auth.onAuthStateChange>[0] | undefined
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation(
      (nextCallback) => {
        callback = nextCallback
        return {
          data: {
            subscription: {
              id: 'events',
              callback: nextCallback,
              unsubscribe: vi.fn(),
            },
          },
        }
      },
    )
    const listener = vi.fn()
    client.onAuthStateChange(listener)
    callback?.('INITIAL_SESSION', session)
    callback?.('TOKEN_REFRESHED', session)
    callback?.('USER_UPDATED', session)
    callback?.('PASSWORD_RECOVERY', session)
    callback?.('SIGNED_OUT', null)
    expect(listener.mock.calls.map(([change]) => change.event)).toEqual([
      'initial-session',
      'token-refreshed',
      'user-updated',
      'password-recovery',
      'signed-out',
    ])
  })

  it('clasifica fallos de red', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    await expect(client.getSession()).rejects.toMatchObject({
      kind: 'network',
      message: 'Se requiere conexión a Internet para completar esta acción.',
    })
  })
})
