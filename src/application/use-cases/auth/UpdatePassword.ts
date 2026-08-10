import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@application/contracts/auth'
import type { AuthClient } from '@application/services/AuthClient'

export class UpdatePassword {
  constructor(private readonly authClient: AuthClient) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const parsed = resetPasswordSchema.parse(input)
    await this.authClient.updatePassword(parsed.password)
  }
}
