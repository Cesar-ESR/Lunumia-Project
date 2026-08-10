export interface AccountDeletionClient {
  deleteCurrentAccount(): Promise<void>
}

export class AccountDeletionError extends Error {
  constructor(
    message = 'No fue posible eliminar la cuenta.',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AccountDeletionError'
  }
}
