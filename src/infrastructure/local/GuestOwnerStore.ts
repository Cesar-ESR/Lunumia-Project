const OWNER_STORAGE_KEY = 'gastoclaro.guest-owner-id'
const ACTIVE_OWNER_STORAGE_KEY = 'gastoclaro.active-owner-id'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function getOrCreateGuestOwnerId(
  storage: KeyValueStorage = globalThis.localStorage,
  generateId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const stored = storage.getItem(OWNER_STORAGE_KEY)
  if (stored?.startsWith('guest:')) return stored

  const ownerId = `guest:${generateId()}`
  storage.setItem(OWNER_STORAGE_KEY, ownerId)
  return ownerId
}

export function setActiveOwnerId(
  ownerId: string,
  storage: KeyValueStorage = globalThis.localStorage,
): void {
  storage.setItem(ACTIVE_OWNER_STORAGE_KEY, ownerId)
}

export function getStoredActiveOwnerId(
  storage: KeyValueStorage = globalThis.localStorage,
): string | null {
  return storage.getItem(ACTIVE_OWNER_STORAGE_KEY)
}

export function activateGuestOwner(
  storage: KeyValueStorage = globalThis.localStorage,
  generateId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const ownerId = getOrCreateGuestOwnerId(storage, generateId)
  setActiveOwnerId(ownerId, storage)
  return ownerId
}

export function createNewGuestOwnerId(
  storage: KeyValueStorage = globalThis.localStorage,
  generateId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const ownerId = `guest:${generateId()}`
  storage.setItem(OWNER_STORAGE_KEY, ownerId)
  setActiveOwnerId(ownerId, storage)
  return ownerId
}
