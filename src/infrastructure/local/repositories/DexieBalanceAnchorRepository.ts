import type { BalanceAnchor } from '@domain/entities'
import type { IBalanceAnchorRepository } from '@domain/repositories'
import { GastoClaroDB } from '../database'

export class DexieBalanceAnchorRepository implements IBalanceAnchorRepository {
  constructor(
    private readonly db: GastoClaroDB,
    private readonly ownerId: string,
  ) {}

  async create(value: BalanceAnchor): Promise<BalanceAnchor> {
    if (value.ownerId !== this.ownerId)
      throw new Error('La entidad no pertenece al propietario del repositorio.')
    await this.db.balanceAnchors.add(value)
    return value
  }

  async findById(id: string): Promise<BalanceAnchor | null> {
    const value = await this.db.balanceAnchors.get(id)
    return value?.ownerId === this.ownerId && value.deletedAt === null
      ? value
      : null
  }

  async findLatest(): Promise<BalanceAnchor | null> {
    return (
      (await this.db.balanceAnchors
        .where('[ownerId+capturedAt+updatedAt+id]')
        .between(
          [this.ownerId, '', '', ''],
          [this.ownerId, '\uffff', '\uffff', '\uffff'],
          true,
          true,
        )
        .reverse()
        .filter((value) => value.deletedAt === null)
        .first()) ?? null
    )
  }
}
