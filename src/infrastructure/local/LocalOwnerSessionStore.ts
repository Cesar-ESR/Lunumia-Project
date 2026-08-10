import type { OwnerSessionStore } from '@application/services/OwnerSessionStore'
import {
  activateGuestOwner,
  createNewGuestOwnerId,
  setActiveOwnerId,
  type KeyValueStorage,
} from './GuestOwnerStore'

export class LocalOwnerSessionStore implements OwnerSessionStore {
  constructor(
    private readonly storage: KeyValueStorage = globalThis.localStorage,
    private readonly generateId: () => string = () =>
      globalThis.crypto.randomUUID(),
  ) {}

  setActive(ownerId: string): void {
    setActiveOwnerId(ownerId, this.storage)
  }

  activateGuest(): string {
    return activateGuestOwner(this.storage, this.generateId)
  }

  createEmptyGuest(): string {
    return createNewGuestOwnerId(this.storage, this.generateId)
  }
}
