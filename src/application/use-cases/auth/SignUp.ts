import { signUpSchema, type SignUpInput } from '@application/contracts/auth'
import type { AuthClient, AuthResult } from '@application/services/AuthClient'

export class SignUp {
  constructor(private readonly authClient: AuthClient) {}

  async execute(
    input: SignUpInput,
    emailVerificationRedirect: string,
    passwordRecoveryRedirect: string,
  ): Promise<AuthResult> {
    const parsed = signUpSchema.parse(input)
    await this.authClient.requestPasswordReset(
      parsed.email,
      passwordRecoveryRedirect,
    )
    return this.authClient.signUp(parsed, emailVerificationRedirect)
  }
}
