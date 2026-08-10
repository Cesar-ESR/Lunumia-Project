import type {
  ValidSignInInput,
  ValidSignUpInput,
} from '@application/contracts/auth'

export interface AuthUser {
  id: string
  email: string
}

export interface AuthSession {
  user: AuthUser
  expiresAt: number | null
}

export interface AuthResult {
  user: AuthUser | null
  session: AuthSession | null
  requiresEmailVerification: boolean
}

export interface AuthCodeExchangeResult {
  session: AuthSession
  kind: 'authentication' | 'recovery'
}

export type AuthStateEvent =
  | 'initial-session'
  | 'signed-in'
  | 'signed-out'
  | 'token-refreshed'
  | 'user-updated'
  | 'password-recovery'
  | 'mfa-challenge-verified'

export interface AuthStateChange {
  event: AuthStateEvent
  session: AuthSession | null
}

export type AuthStateListener = (change: AuthStateChange) => void
export type Unsubscribe = () => void
export type AuthStatus =
  | 'loading'
  | 'revalidating'
  | 'guest'
  | 'authenticated'
  | 'offline-authenticated'

export interface SessionState {
  status: Exclude<AuthStatus, 'loading' | 'revalidating'>
  session: AuthSession | null
}

export interface SessionService {
  restore(
    isOnline: boolean,
    hasLocalData: (ownerId: string) => Promise<boolean>,
  ): Promise<SessionState>
  subscribe(listener: AuthStateListener): Unsubscribe
}

export interface AuthClient {
  signUp(input: ValidSignUpInput, emailRedirectTo?: string): Promise<AuthResult>
  signIn(input: ValidSignInInput): Promise<AuthResult>
  signOut(): Promise<void>
  clearLocalSession(): Promise<void>
  requestPasswordReset(email: string, redirectTo: string): Promise<void>
  updatePassword(newPassword: string): Promise<void>
  exchangeCodeForSession(
    code: string,
    flowId?: string,
  ): Promise<AuthCodeExchangeResult>
  getSession(): Promise<AuthSession | null>
  revalidateSession(): Promise<AuthSession>
  startAutoRefresh(): void
  stopAutoRefresh(): void
  onAuthStateChange(listener: AuthStateListener): Unsubscribe
}

export type AuthErrorKind =
  'network' | 'authentication' | 'session-invalid' | 'unexpected'

export class AuthClientError extends Error {
  constructor(
    public readonly kind: AuthErrorKind,
    message: string,
    public readonly code: string | null = null,
    public readonly status: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AuthClientError'
  }
}
