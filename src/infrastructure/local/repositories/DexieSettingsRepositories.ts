import type { DeviceSyncState, UserSettings } from '@domain/entities'
import { GastoClaroDB } from '../database'
import {
  persistLocalMutation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '../sync-mutations'

export class DexieUserSettingsRepository {
  private readonly sync: SyncMutationDependencies
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
    dependencies?: Partial<SyncMutationDependencies>,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }
  async get(): Promise<UserSettings | null> {
    return (
      (await this.db.userSettings
        .where('ownerId')
        .equals(this.ownerId)
        .first()) ?? null
    )
  }
  async upsert(value: UserSettings): Promise<UserSettings> {
    let operationType: 'create' | 'update' = 'create'
    return persistLocalMutation(
      this.db,
      this.db.userSettings,
      this.ownerId,
      'userSettings',
      () => operationType,
      this.sync,
      async () => {
        const existing = await this.db.userSettings
          .where('ownerId')
          .equals(this.ownerId)
          .first()
        operationType = existing ? 'update' : 'create'
        const result = existing
          ? { ...value, id: existing.id, createdAt: existing.createdAt }
          : value
        await this.db.userSettings.put(result)
        return result
      },
    )
  }
}
export class DexieDeviceSyncStateRepository {
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
  ) {}
  async get(
    entityType: DeviceSyncState['entityType'],
  ): Promise<DeviceSyncState | null> {
    return (
      (await this.db.deviceSyncStates
        .where('[ownerId+entityType]')
        .equals([this.ownerId, entityType])
        .first()) ?? null
    )
  }
  async list(): Promise<DeviceSyncState[]> {
    return this.db.deviceSyncStates
      .where('ownerId')
      .equals(this.ownerId)
      .sortBy('entityType')
  }
  async upsert(value: DeviceSyncState): Promise<DeviceSyncState> {
    if (value.ownerId !== this.ownerId)
      throw new Error('El cursor no pertenece al propietario del repositorio.')
    const existing = await this.get(value.entityType)
    const result = existing ? { ...value, id: existing.id } : value
    await this.db.deviceSyncStates.put(result)
    return result
  }
}
