import { z } from 'zod'
import type { AccountDeletionClient } from '@application/services/AccountDeletionClient'

const deleteAccountSchema = z.object({
  confirmation: z.literal('ELIMINAR', {
    error: 'Escribe ELIMINAR para confirmar.',
  }),
})

export class DeleteAccount {
  constructor(private readonly client: AccountDeletionClient) {}

  async execute(input: { confirmation: string }): Promise<void> {
    deleteAccountSchema.parse(input)
    await this.client.deleteCurrentAccount()
  }
}
