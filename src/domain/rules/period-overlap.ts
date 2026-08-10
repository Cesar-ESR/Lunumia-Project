import type { DateOnly } from '@domain/value-objects'

export const periodsOverlap = (
  startA: DateOnly,
  endA: DateOnly,
  startB: DateOnly,
  endB: DateOnly,
): boolean => startA <= endB && startB <= endA
