import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Period } from '@domain/entities'
import { getLocalDateOnly } from '@shared/utils/date'
import { useApplicationServices } from './ApplicationServicesContext'

interface PeriodContextValue {
  periods: Period[]
  activePeriod: Period | null
  isLoading: boolean
  error: Error | null
  setActivePeriod(periodId: string): Promise<void>
  refreshPeriods(): Promise<void>
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function PeriodProvider({ children }: { children: ReactNode }) {
  const services = useApplicationServices()
  const [periods, setPeriods] = useState<Period[]>([])
  const [activePeriod, setActivePeriodState] = useState<Period | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadPeriods = useCallback(async () => {
    setIsLoading(true)
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
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason
          : new Error('No se pudieron cargar los periodos.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [services])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadPeriods(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadPeriods])

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
      isLoading,
      error,
      setActivePeriod,
      refreshPeriods: loadPeriods,
    }),
    [activePeriod, error, isLoading, loadPeriods, periods, setActivePeriod],
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
