export interface OwnerSessionStore {
  setActive(ownerId: string): void
  activateGuest(): string
  createEmptyGuest(): string
}
