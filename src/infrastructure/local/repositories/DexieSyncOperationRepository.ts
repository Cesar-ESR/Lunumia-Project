import type { ISyncOperationRepository } from '@domain/repositories'
import type { SyncOperation } from '@domain/entities'
import { GastoClaroDB } from '../database'
import { isAuthenticatedOwnerId, isUuid } from '../sync-mutations'

export class DexieSyncOperationRepository implements ISyncOperationRepository {
  constructor(
    private readonly db: GastoClaroDB,
    private readonly boundOwnerId?: string,
  ) {}

  async enqueue(value: SyncOperation): Promise<void> {
    if (!isAuthenticatedOwnerId(value.ownerId))
      throw new Error('No se pueden encolar operaciones para un invitado.')
    if (!isUuid(value.operationId))
      throw new Error('operationId debe ser un UUID válido.')
    if (this.boundOwnerId && value.ownerId !== this.boundOwnerId)
      throw new Error('La operación pertenece a otro propietario.')
    const existing = await this.db.syncOperations.get(value.operationId)
    if (existing && existing.ownerId !== value.ownerId)
      throw new Error('operationId ya pertenece a otro propietario.')
    if (!existing) await this.db.syncOperations.add(value)
  }

  async findPending(ownerId?: string): Promise<SyncOperation[]> {
    const owner = this.resolveOwner(ownerId)
    return (
      await this.db.syncOperations
        .where('[ownerId+status+createdAt]')
        .between(
          [owner, 'pending', ''],
          [owner, 'pending', '\uffff'],
          true,
          true,
        )
        .toArray()
    ).sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.operationId.localeCompare(right.operationId),
    )
  }

  async countPending(ownerId?: string): Promise<number> {
    const owner = this.resolveOwner(ownerId)
    return this.db.syncOperations
      .where('[ownerId+status+createdAt]')
      .between([owner, 'pending', ''], [owner, 'pending', '\uffff'], true, true)
      .count()
  }

  async findByOperationId(
    operationId: string,
    ownerId?: string,
  ): Promise<SyncOperation | null> {
    const owner = this.resolveOwner(ownerId)
    const value = await this.db.syncOperations.get(operationId)
    return value?.ownerId === owner ? value : null
  }

  async markProcessing(operationId: string, ownerId?: string): Promise<void> {
    await this.setStatus(operationId, 'processing', ownerId)
  }

  async markError(
    operationId: string,
    error: string,
    ownerId?: string,
  ): Promise<void> {
    const value = await this.findByOperationId(operationId, ownerId)
    if (value)
      await this.db.syncOperations.put({
        ...value,
        status: 'error',
        errorMessage: error,
        retryCount: value.retryCount + 1,
      })
  }

  async remove(operationId: string, ownerId?: string): Promise<void> {
    const value = await this.findByOperationId(operationId, ownerId)
    if (value) await this.db.syncOperations.delete(operationId)
  }

  async clearByOwner(ownerId: string): Promise<void> {
    if (this.boundOwnerId && ownerId !== this.boundOwnerId)
      throw new Error('No se puede limpiar la cola de otro propietario.')
    await this.db.syncOperations.where('ownerId').equals(ownerId).delete()
  }

  async dequeue(operationId: string): Promise<void> {
    await this.remove(operationId)
  }
  async count(): Promise<number> {
    return this.db.syncOperations
      .where('ownerId')
      .equals(this.resolveOwner())
      .count()
  }
  async findById(operationId: string): Promise<SyncOperation | null> {
    return this.findByOperationId(operationId)
  }
  async markAsProcessing(operationId: string): Promise<void> {
    await this.markProcessing(operationId)
  }
  async markAsSynced(operationId: string): Promise<void> {
    await this.remove(operationId)
  }

  private async setStatus(
    operationId: string,
    status: SyncOperation['status'],
    ownerId?: string,
  ): Promise<void> {
    const value = await this.findByOperationId(operationId, ownerId)
    if (value)
      await this.db.syncOperations.put({
        ...value,
        status,
        errorMessage: status === 'processing' ? null : value.errorMessage,
      })
  }

  private resolveOwner(ownerId?: string): string {
    const resolved = ownerId ?? this.boundOwnerId
    if (!resolved)
      throw new Error('Se requiere ownerId para acceder a la cola.')
    return resolved
  }
}
