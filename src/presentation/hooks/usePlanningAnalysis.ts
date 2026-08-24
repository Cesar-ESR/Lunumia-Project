import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildPlanningAnalysisRequest,
  requireCompletePlanningAnalysisRequest,
} from '@application/contracts'
import type { FinancialSnapshot } from '@domain/calculations'
import type { PlanningAnalysisResponse } from '@domain/ports'
import { presentAIError } from '../utils/ai-errors'

export interface ExplainPlanningAction {
  execute(snapshot: FinancialSnapshot): Promise<PlanningAnalysisResponse>
}

type PlanningAnalysisState = {
  key: string
  status: 'idle' | 'loading' | 'success' | 'rate_limited' | 'error'
  message: string | null
  response: PlanningAnalysisResponse | null
}

export function usePlanningAnalysis({
  action,
  snapshot,
  enabled,
  now = Date.now,
}: {
  action: ExplainPlanningAction | null
  snapshot: FinancialSnapshot
  enabled: boolean
  now?: () => number
}) {
  const canonicalRequest = buildPlanningAnalysisRequest(snapshot)
  const key = JSON.stringify(canonicalRequest)
  const eligible = isEligible(canonicalRequest)
  const [state, setState] = useState<PlanningAnalysisState>({
    key,
    status: 'idle',
    message: null,
    response: null,
  })
  const generation = useRef(0)
  const inFlightGeneration = useRef<number | null>(null)
  const rateLimitedUntil = useRef(0)
  const currentKey = useRef(key)

  useEffect(() => {
    currentKey.current = key
    generation.current += 1
    inFlightGeneration.current = null
  }, [key])

  useEffect(
    () => () => {
      generation.current += 1
      inFlightGeneration.current = null
    },
    [],
  )

  const generate = useCallback(async () => {
    if (!action || !enabled || !eligible || inFlightGeneration.current !== null)
      return
    if (now() < rateLimitedUntil.current) {
      setState({
        key,
        status: 'rate_limited',
        message:
          'Alcanzaste temporalmente el límite de funciones inteligentes.',
        response: null,
      })
      return
    }
    const requestGeneration = ++generation.current
    inFlightGeneration.current = requestGeneration
    setState({ key, status: 'loading', message: null, response: null })
    try {
      const response = await action.execute(snapshot)
      if (
        generation.current !== requestGeneration ||
        currentKey.current !== key
      )
        return
      setState({ key, status: 'success', message: null, response })
    } catch (reason) {
      if (
        generation.current !== requestGeneration ||
        currentKey.current !== key
      )
        return
      const presented = presentAIError(reason)
      if (presented.kind === 'rate_limited')
        rateLimitedUntil.current =
          now() + (presented.retryAfterSeconds ?? 60) * 1_000
      setState({
        key,
        status: presented.kind,
        message: presented.message,
        response: null,
      })
    } finally {
      if (inFlightGeneration.current === requestGeneration)
        inFlightGeneration.current = null
    }
  }, [action, eligible, enabled, key, now, snapshot])

  if (state.key !== key)
    return {
      status: 'idle' as const,
      message: null,
      response: null,
      eligible,
      generate,
    }
  return { ...state, eligible, generate }
}

function isEligible(
  request: ReturnType<typeof buildPlanningAnalysisRequest>,
): boolean {
  try {
    requireCompletePlanningAnalysisRequest(request)
    return true
  } catch {
    return false
  }
}
