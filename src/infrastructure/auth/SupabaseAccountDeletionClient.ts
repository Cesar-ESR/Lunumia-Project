import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AccountDeletionError,
  type AccountDeletionClient,
} from '@application/services/AccountDeletionClient'
import type { Database } from '@infrastructure/remote/database.types'

export class SupabaseAccountDeletionClient implements AccountDeletionClient {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async deleteCurrentAccount(): Promise<void> {
    try {
      const { error } = await this.client.functions.invoke('delete-account', {
        method: 'POST',
        body: { confirmation: 'ELIMINAR' },
      })
      if (error) throw error
    } catch (reason) {
      throw new AccountDeletionError(
        'No fue posible eliminar la cuenta. Inténtalo nuevamente.',
        reason instanceof Error ? { cause: reason } : undefined,
      )
    }
  }
}
