import { useCallback, useEffect, useRef, useState } from 'react'
import type { PeriodAggregatedData, PeriodSummary } from '@domain/ports'
import { presentAIError } from '../utils/ai-errors'

export interface GeneratePeriodSummaryAction {
  execute(aggregatedData: PeriodAggregatedData): Promise<PeriodSummary>
}

export type PeriodSummaryState = {
  status: 'idle' | 'loading' | 'success' | 'rate_limited' | 'error'
  summary: PeriodSummary | null
  message: string | null
}

export function periodDataFingerprint(data: PeriodAggregatedData): string {
  return JSON.stringify(data)
}

export function usePeriodSummary({
  action,
  data,
  enabled,
  identityKey,
  periodId,
  now = Date.now,
}: {
  action: GeneratePeriodSummaryAction | null
  data: PeriodAggregatedData | null
  enabled: boolean
  identityKey: string
  periodId: string | null
  now?: () => number
}) {
  const [state, setState] = useState<PeriodSummaryState>({
    status: 'idle',
    summary: null,
    message: null,
  })
  const cache = useRef(new Map<string, PeriodSummary>())
  const identity = useRef(identityKey)
  const generation = useRef(0)
  const inFlightKey = useRef<string | null>(null)
  const rateLimitedUntil = useRef(0)
  const fingerprint = data ? periodDataFingerprint(data) : ''
  const key =
    data && periodId ? `${identityKey}:${periodId}:${fingerprint}` : ''

  useEffect(() => {
    generation.current += 1
    inFlightKey.current = null
    if (identity.current !== identityKey) {
      cache.current.clear()
      rateLimitedUntil.current = 0
      identity.current = identityKey
    }
    const cached = key ? cache.current.get(key) : null
    setState({
      status: cached ? 'success' : 'idle',
      summary: cached ?? null,
      message: null,
    })
  }, [identityKey, key])

  useEffect(
    () => () => {
      generation.current += 1
      inFlightKey.current = null
    },
    [],
  )

  const generate = useCallback(async () => {
    if (
      !action ||
      !data ||
      !enabled ||
      !key ||
      inFlightKey.current === key ||
      (data.totalIncome === 0 && data.totalExpenses === 0)
    )
      return
    if (now() < rateLimitedUntil.current) {
      setState((current) => ({
        ...current,
        status: 'rate_limited',
        message:
          'Alcanzaste temporalmente el límite de funciones inteligentes.',
      }))
      return
    }
    const requestGeneration = ++generation.current
    inFlightKey.current = key
    setState((current) => ({ ...current, status: 'loading', message: null }))
    try {
      const summary = await action.execute(data)
      if (
        generation.current !== requestGeneration ||
        inFlightKey.current !== key
      )
        return
      cache.current.set(key, summary)
      setState({ status: 'success', summary, message: null })
    } catch (reason) {
      if (generation.current !== requestGeneration) return
      const presented = presentAIError(reason)
      if (presented.kind === 'rate_limited')
        rateLimitedUntil.current =
          now() + (presented.retryAfterSeconds ?? 60) * 1_000
      setState((current) => ({
        ...current,
        status: presented.kind,
        message: `${presented.message} Tus cifras siguen disponibles.`,
      }))
    } finally {
      if (inFlightKey.current === key) inFlightKey.current = null
    }
  }, [action, data, enabled, key, now])

  return { ...state, generate }
}
