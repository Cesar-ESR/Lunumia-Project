export type BackupErrorCode =
  | 'INVALID_BACKUP_FILE'
  | 'UNSUPPORTED_BACKUP_VERSION'
  | 'FUTURE_BACKUP_VERSION'
  | 'BACKUP_INTEGRITY_ERROR'
  | 'BACKUP_EXPORT_ERROR'
  | 'BACKUP_IMPORT_ERROR'

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BackupError'
  }
}
