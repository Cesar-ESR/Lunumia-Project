import { signUpSchema, type SignUpInput } from '@application/contracts/auth'
import type { AuthClient, AuthResult } from '@application/services/AuthClient'

export class SignUp {
  constructor(private readonly authClient: AuthClient) {}

  execute(input: SignUpInput, emailRedirectTo?: string): Promise<AuthResult> {
    return this.authClient.signUp(signUpSchema.parse(input), emailRedirectTo)
  }
}
