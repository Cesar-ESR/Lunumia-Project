import type { Period } from '@domain/entities'
import { periodsOverlap } from '@domain/rules/period-overlap'

export type CanonicalPeriodMetadata = Pick<
  Period, 'id' | 'ownerId' | 'type' | 'startDate' | 'endDate' | 'deletedAt'
>

export type PeriodNavigationCandidate =
  | 'REMOTE_ID_MATCH'
  | 'SAFE_LOCAL_ONLY'
  | 'EXACT_REMOTE_EQUIVALENT'
  | 'TRUE_OVERLAP'
  | 'INVALID_LOCAL_REFERENCE'

/** Classification only; exact aliases remain for the existing sync recovery. */
export function classifyPeriodNavigationCandidate(
  ownerId: string,
  local: CanonicalPeriodMetadata | null | undefined,
  remote: readonly CanonicalPeriodMetadata[],
): PeriodNavigationCandidate {
  if (!local || local.ownerId !== ownerId || local.deletedAt !== null)
    return 'INVALID_LOCAL_REFERENCE'
  const active = remote.filter((period) => period.ownerId === ownerId && period.deletedAt === null)
  if (active.some((period) => period.id === local.id)) return 'REMOTE_ID_MATCH'
  if (active.some((period) => period.type === local.type && period.startDate === local.startDate && period.endDate === local.endDate))
    return 'EXACT_REMOTE_EQUIVALENT'
  if (active.some((period) => periodsOverlap(local.startDate, local.endDate, period.startDate, period.endDate)))
    return 'TRUE_OVERLAP'
  return 'SAFE_LOCAL_ONLY'
}
