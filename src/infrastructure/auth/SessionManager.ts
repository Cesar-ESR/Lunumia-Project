import type {
  AuthClient,
  AuthStateListener,
  SessionService,
  SessionState,
  Unsubscribe,
} from '@application/services/AuthClient'

export class SessionManager implements SessionService {
  constructor(private readonly authClient: AuthClient) {}

  async restore(
    isOnline: boolean,
    hasLocalData: (ownerId: string) => Promise<boolean>,
  ): Promise<SessionState> {
    void hasLocalData
    const session = await this.authClient.getSession()
    if (!session) return { status: 'guest', session: null }
    if (isOnline) return { status: 'authenticated', session }
    return { status: 'offline-authenticated', session }
  }

  subscribe(listener: AuthStateListener): Unsubscribe {
    return this.authClient.onAuthStateChange(listener)
  }
}
