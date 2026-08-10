import { describe, expect, it, vi } from 'vitest'
import type { AuthClient, AuthSession } from '@application/services/AuthClient'
import { SessionManager } from './SessionManager'

const session: AuthSession = {
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'persona@example.com',
  },
  expiresAt: 1_800_000_000,
}

function authClient(current: AuthSession | null): AuthClient {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    clearLocalSession: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(async () => current),
    revalidateSession: vi.fn(async () => {
      if (!current) throw new Error('missing session')
      return current
    }),
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn(),
    onAuthStateChange: vi.fn(() => vi.fn()),
  }
}

describe('SessionManager', () => {
  it('restaura una sesión válida cuando hay conexión', async () => {
    const hasLocalData = vi.fn(async () => false)
    await expect(
      new SessionManager(authClient(session)).restore(true, hasLocalData),
    ).resolves.toEqual({ status: 'authenticated', session })
    expect(hasLocalData).not.toHaveBeenCalled()
  })

  it('preserva la identidad offline aunque todavía no existan datos locales', async () => {
    const hasLocalData = vi.fn(
      async (ownerId: string) => ownerId === session.user.id,
    )
    await expect(
      new SessionManager(authClient(session)).restore(false, hasLocalData),
    ).resolves.toEqual({ status: 'offline-authenticated', session })
    await expect(
      new SessionManager(authClient(session)).restore(false, async () => false),
    ).resolves.toEqual({ status: 'offline-authenticated', session })
  })

  it('delega una única suscripción y su cleanup', () => {
    const client = authClient(null)
    const unsubscribe = vi.fn()
    vi.mocked(client.onAuthStateChange).mockReturnValue(unsubscribe)
    const listener = vi.fn()
    const cleanup = new SessionManager(client).subscribe(listener)
    expect(client.onAuthStateChange).toHaveBeenCalledOnce()
    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
