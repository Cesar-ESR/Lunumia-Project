import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Period } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { useApplicationServices } from './ApplicationServicesContext'
import { useOptionalSync } from './SyncContext'

interface PeriodContextValue {
  periods: Period[]
  activePeriod: Period | null
  lastAppliedSyncAt: string | null
  isLoading: boolean
  error: Error | null
  setActivePeriod(periodId: string): Promise<void>
  refreshPeriods(): Promise<void>
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function PeriodProvider({ children }: { children: ReactNode }) {
  const services = useApplicationServices()
  const sync = useOptionalSync()
  const [periods, setPeriods] = useState<Period[]>([])
  const [activePeriod, setActivePeriodState] = useState<Period | null>(null)
  const [lastAppliedSyncAt, setLastAppliedSyncAt] = useState<string | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const loadQueue = useRef<Promise<void>>(Promise.resolve())
  const refreshedSyncAt = useRef<string | null>(null)

  const readPeriods = useCallback(
    async (showLoading: boolean, onSuccess?: () => void) => {
      if (showLoading) setIsLoading(true)
      setError(null)
      try {
        await services.initialize.execute()
        const [nextPeriods, settings] = await Promise.all([
          services.periods.listPeriods.execute(),
          services.settings.getUserSettings.execute(),
        ])
        let selected = settings?.activePeriodId
          ? (nextPeriods.find(
              (period) => period.id === settings.activePeriodId,
            ) ?? null)
          : null
        if (!selected) {
          const today = getLocalDateOnly()
          selected =
            nextPeriods.find(
              (period) => period.startDate <= today && today <= period.endDate,
            ) ?? null
          if (selected)
            await services.periods.setActivePeriod.execute(selected.id)
        }
        setPeriods(nextPeriods)
        setActivePeriodState(selected)
        onSuccess?.()
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason
            : new Error('No se pudieron cargar los periodos.'),
        )
      } finally {
        if (showLoading) setIsLoading(false)
      }
    },
    [services],
  )

  const loadPeriods = useCallback(
    (showLoading = true, onSuccess?: () => void) => {
      const operation = loadQueue.current.then(() =>
        readPeriods(showLoading, onSuccess),
      )
      loadQueue.current = operation
      return operation
    },
    [readPeriods],
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadPeriods(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadPeriods])

  useEffect(() => {
    const successfulAt = sync?.lastSuccessfulSyncAt ?? null
    if (
      !successfulAt ||
      sync?.ownerId !== services.ownerId ||
      refreshedSyncAt.current === successfulAt
    )
      return
    refreshedSyncAt.current = successfulAt
    void loadPeriods(false, () => setLastAppliedSyncAt(successfulAt))
  }, [loadPeriods, services.ownerId, sync?.lastSuccessfulSyncAt, sync?.ownerId])

  const setActivePeriod = useCallback(
    async (periodId: string) => {
      await services.periods.setActivePeriod.execute(periodId)
      const selected =
        periods.find((period) => period.id === periodId) ??
        (await services.periods.listPeriods.execute()).find(
          (period) => period.id === periodId,
        )
      if (!selected)
        throw new Error('El periodo seleccionado no está disponible.')
      setActivePeriodState(selected)
    },
    [periods, services],
  )

  const value = useMemo(
    () => ({
      periods,
      activePeriod,
      lastAppliedSyncAt,
      isLoading,
      error,
      setActivePeriod,
      refreshPeriods: loadPeriods,
    }),
    [
      activePeriod,
      error,
      isLoading,
      lastAppliedSyncAt,
      loadPeriods,
      periods,
      setActivePeriod,
    ],
  )

  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePeriod(): PeriodContextValue {
  const context = useContext(PeriodContext)
  if (!context)
    throw new Error('usePeriod debe usarse dentro de PeriodProvider.')
  return context
}
