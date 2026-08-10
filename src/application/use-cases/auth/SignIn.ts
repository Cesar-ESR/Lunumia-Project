import { signInSchema, type SignInInput } from '@application/contracts/auth'
import type { AuthClient, AuthResult } from '@application/services/AuthClient'

export class SignIn {
  constructor(private readonly authClient: AuthClient) {}

  execute(input: SignInInput): Promise<AuthResult> {
    return this.authClient.signIn(signInSchema.parse(input))
  }
}
