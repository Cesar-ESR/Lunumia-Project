import type {
  AuthChangeEvent,
  AuthSession as SupabaseSession,
  AuthUser as SupabaseUser,
  SupabaseClient,
} from '@supabase/supabase-js'
import type {
  ValidSignInInput,
  ValidSignUpInput,
} from '@application/contracts/auth'
import {
  AuthClientError,
  type AuthClient,
  type AuthCodeExchangeResult,
  type AuthResult,
  type AuthSession,
  type AuthStateEvent,
  type AuthStateListener,
  type AuthUser,
  type Unsubscribe,
} from '@application/services/AuthClient'
import type { Database } from '@infrastructure/remote/database.types'

function mapUser(user: SupabaseUser | null): AuthUser | null {
  if (!user) return null
  return { id: user.id, email: user.email ?? '' }
}

function mapSession(session: SupabaseSession | null): AuthSession | null {
  if (!session) return null
  return {
    user: { id: session.user.id, email: session.user.email ?? '' },
    expiresAt: session.expires_at ?? null,
  }
}

const invalidSessionCodes = new Set([
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_expired',
  'session_not_found',
])

interface SupabaseAuthErrorShape {
  code?: unknown
  status?: unknown
  name?: unknown
}

function authError(
  reason: unknown,
  operation: 'default' | 'refresh' = 'default',
): AuthClientError {
  const authReason = reason as SupabaseAuthErrorShape
  const code = typeof authReason?.code === 'string' ? authReason.code : null
  const status =
    typeof authReason?.status === 'number' ? authReason.status : null
  const name = typeof authReason?.name === 'string' ? authReason.name : ''
  const message = reason instanceof Error ? reason.message.toLowerCase() : ''
  const isNetwork =
    reason instanceof TypeError ||
    name === 'AuthRetryableFetchError' ||
    code === 'request_timeout' ||
    status === 429 ||
    (status !== null && status >= 500) ||
    message.includes('fetch') ||
    message.includes('network')
  const isInvalidSession =
    operation === 'refresh' &&
    (invalidSessionCodes.has(code ?? '') || name === 'AuthSessionMissingError')
  return new AuthClientError(
    isInvalidSession
      ? 'session-invalid'
      : isNetwork
        ? 'network'
        : 'authentication',
    isNetwork
      ? 'Se requiere conexión a Internet para completar esta acción.'
      : 'No fue posible completar la autenticación.',
    code,
    status,
    reason instanceof Error ? { cause: reason } : undefined,
  )
}

function mapAuthEvent(event: AuthChangeEvent): AuthStateEvent {
  const events: Record<AuthChangeEvent, AuthStateEvent> = {
    INITIAL_SESSION: 'initial-session',
    SIGNED_IN: 'signed-in',
    SIGNED_OUT: 'signed-out',
    TOKEN_REFRESHED: 'token-refreshed',
    USER_UPDATED: 'user-updated',
    PASSWORD_RECOVERY: 'password-recovery',
    MFA_CHALLENGE_VERIFIED: 'mfa-challenge-verified',
  }
  return events[event]
}

export class SupabaseAuthClient implements AuthClient {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (reason) {
      throw authError(reason)
    }
  }

  async signUp(
    input: ValidSignUpInput,
    emailRedirectTo?: string,
  ): Promise<AuthResult> {
    const { data, error } = await this.execute(() =>
      this.client.auth.signUp({
        email: input.email,
        password: input.password,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      }),
    )
    if (error) throw authError(error)
    return {
      user: mapUser(data.user),
      session: mapSession(data.session),
      requiresEmailVerification: data.user !== null && data.session === null,
    }
  }

  async signIn(input: ValidSignInInput): Promise<AuthResult> {
    const { data, error } = await this.execute(() =>
      this.client.auth.signInWithPassword(input),
    )
    if (error) throw authError(error)
    return {
      user: mapUser(data.user),
      session: mapSession(data.session),
      requiresEmailVerification: false,
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.execute(() => this.client.auth.signOut())
    if (error) throw authError(error)
  }

  async clearLocalSession(): Promise<void> {
    const { error } = await this.execute(() =>
      this.client.auth.signOut({ scope: 'local' }),
    )
    if (error) throw authError(error)
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.execute(() =>
      this.client.auth.resetPasswordForEmail(email, { redirectTo }),
    )
    if (error) throw authError(error)
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.execute(() =>
      this.client.auth.updateUser({ password: newPassword }),
    )
    if (error) throw authError(error)
  }

  async exchangeCodeForSession(
    code: string,
    flowId?: string,
  ): Promise<AuthCodeExchangeResult> {
    let kind: AuthCodeExchangeResult['kind'] = 'authentication'
    const { data: authState } = this.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') kind = 'recovery'
    })
    try {
      const { data, error } = await this.execute(() =>
        this.client.auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined,
        ),
      )
      if (error) throw authError(error)
      const session = mapSession(data.session)
      if (!session)
        throw new AuthClientError(
          'authentication',
          'No fue posible completar la autenticación.',
        )
      return { session, kind }
    } finally {
      authState.subscription.unsubscribe()
    }
  }

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.execute(() =>
      this.client.auth.getSession(),
    )
    if (error) throw authError(error)
    return mapSession(data.session)
  }

  async revalidateSession(): Promise<AuthSession> {
    let result: Awaited<ReturnType<typeof this.client.auth.refreshSession>>
    try {
      result = await this.client.auth.refreshSession()
    } catch (reason) {
      throw authError(reason, 'refresh')
    }
    if (result.error) throw authError(result.error, 'refresh')
    const session = mapSession(result.data.session)
    if (!session)
      throw new AuthClientError(
        'session-invalid',
        'No fue posible completar la autenticación.',
        'session_not_found',
      )
    return session
  }

  startAutoRefresh(): void {
    this.client.auth.startAutoRefresh()
  }

  stopAutoRefresh(): void {
    this.client.auth.stopAutoRefresh()
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const { data } = this.client.auth.onAuthStateChange((event, session) =>
      listener({ event: mapAuthEvent(event), session: mapSession(session) }),
    )
    return () => data.subscription.unsubscribe()
  }
}
