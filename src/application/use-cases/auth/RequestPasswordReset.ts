import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@application/contracts/auth'
import type { AuthClient } from '@application/services/AuthClient'

export class RequestPasswordReset {
  constructor(private readonly authClient: AuthClient) {}

  async execute(input: ForgotPasswordInput, redirectTo: string): Promise<void> {
    const parsed = forgotPasswordSchema.parse(input)
    await this.authClient.requestPasswordReset(parsed.email, redirectTo)
  }
}
