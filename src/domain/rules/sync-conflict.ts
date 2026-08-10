export interface SyncVersion {
  id: string
  updatedAt: string
}

export type SyncVersionWinner = 'local' | 'remote' | 'equal'

export function resolveLastWriteWins(
  local: SyncVersion,
  remote: SyncVersion,
): SyncVersionWinner {
  const timestampComparison = local.updatedAt.localeCompare(remote.updatedAt)
  if (timestampComparison < 0) return 'remote'
  if (timestampComparison > 0) return 'local'

  const idComparison = local.id.localeCompare(remote.id)
  if (idComparison < 0) return 'remote'
  if (idComparison > 0) return 'local'
  return 'equal'
}
