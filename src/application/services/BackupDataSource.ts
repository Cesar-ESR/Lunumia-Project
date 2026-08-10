import type { BackupData } from '@application/contracts/backup.schema'

export interface BackupDataSource {
  readActive(ownerId: string): Promise<BackupData>
  replace(ownerId: string, data: BackupData): Promise<void>
}
