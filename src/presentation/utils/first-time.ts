import type { PeriodType } from '@domain/entities'
import type { DateOnly } from '@domain/value-objects'
import { getLocalDateOnly } from '@shared/utils/date'

export interface PeriodProposal {
  type: PeriodType
  startDate: DateOnly
  endDate: DateOnly
}

export function createMonthlyPeriodProposal(
  localDate = new Date(),
): PeriodProposal {
  return resolvePeriodProposal('monthly', localDate)
}

export function resolvePeriodProposal(
  type: PeriodType,
  localDate = new Date(),
): PeriodProposal {
  const year = localDate.getFullYear()
  const month = localDate.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startsInSecondHalf = type === 'biweekly' && localDate.getDate() > 15
  const startDay = startsInSecondHalf ? 16 : 1
  const endDay = type === 'biweekly' && !startsInSecondHalf ? 15 : lastDay

  return {
    type,
    startDate: getLocalDateOnly(new Date(year, month, startDay)),
    endDate: getLocalDateOnly(new Date(year, month, endDay)),
  }
}

export function formatPeriodProposal({
  startDate,
  endDate,
}: Pick<PeriodProposal, 'startDate' | 'endDate'>): string {
  const toLocalDate = (value: DateOnly) => {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  }
  const start = toLocalDate(startDate)
  const end = toLocalDate(endDate)
  const monthYear = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(start)
  return `${start.getDate()}–${end.getDate()} ${monthYear}`
}

export function readInternalDestination(
  state: unknown,
  fallback = '/inicio',
): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return fallback
  const from = state.from
  if (
    typeof from !== 'string' ||
    !from.startsWith('/') ||
    from.startsWith('//') ||
    from.startsWith('/configuracion-inicial') ||
    from.startsWith('/saldo/inicial')
  )
    return fallback
  return from
}
