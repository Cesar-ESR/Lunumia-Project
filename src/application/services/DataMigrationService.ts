import { z } from 'zod'

export interface GuestDataSummary {
  periods: number
  incomes: number
  expenses: number
  categories: number
  budgets: number
  recurringPayments: number
  occurrences: number
  hasData: boolean
}

export interface OwnerDataPort {
  summarize(ownerId: string): Promise<GuestDataSummary>
  migrateOwner(sourceOwnerId: string, targetOwnerId: string): Promise<void>
  deleteOwner(ownerId: string): Promise<void>
  deleteOwnerIfResolved(ownerId: string): Promise<number>
  countUnresolvedOperations(ownerId: string): Promise<number>
  hasLocalData(ownerId: string): Promise<boolean>
}

const authenticatedOwnerSchema = z
  .string()
  .uuid('La cuenta autenticada no tiene un identificador válido.')

export class DataMigrationService {
  constructor(private readonly ownerData: OwnerDataPort) {}

  summarize(ownerId: string): Promise<GuestDataSummary> {
    return this.ownerData.summarize(ownerId)
  }

  async migrate(sourceOwnerId: string, targetOwnerId: string): Promise<void> {
    if (!sourceOwnerId.startsWith('guest:'))
      throw new Error('El propietario de origen no es un invitado válido.')
    if (sourceOwnerId === targetOwnerId)
      throw new Error(
        'El propietario de origen y destino deben ser diferentes.',
      )
    authenticatedOwnerSchema.parse(targetOwnerId)
    await this.ownerData.migrateOwner(sourceOwnerId, targetOwnerId)
  }
}

export class LocalUserDataCleaner {
  constructor(private readonly ownerData: OwnerDataPort) {}

  deleteOwner(ownerId: string): Promise<void> {
    return this.ownerData.deleteOwner(ownerId)
  }

  deleteOwnerIfResolved(ownerId: string): Promise<number> {
    return this.ownerData.deleteOwnerIfResolved(ownerId)
  }

  countUnresolvedOperations(ownerId: string): Promise<number> {
    return this.ownerData.countUnresolvedOperations(ownerId)
  }

  hasLocalData(ownerId: string): Promise<boolean> {
    return this.ownerData.hasLocalData(ownerId)
  }
}
