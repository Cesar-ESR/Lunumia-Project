import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CalculatedCategoryChange,
  CategoryChangeExplanation,
} from '@domain/ports'
import { presentAIError } from '../utils/ai-errors'

export interface ExplainCategoryChangesAction {
  execute(
    changes: ReadonlyArray<CalculatedCategoryChange>,
  ): Promise<ReadonlyArray<CategoryChangeExplanation>>
}

type ExplanationState = {
  key: string
  status: 'idle' | 'loading' | 'success' | 'rate_limited' | 'error'
  message: string | null
  explanations: ReadonlyMap<string, string>
}

const EMPTY_EXPLANATIONS: ReadonlyMap<string, string> = new Map()

export function useCategoryChangeExplanations({
  action,
  changes,
  enabled,
  identityKey,
  comparisonKey,
  now = Date.now,
}: {
  action: ExplainCategoryChangesAction | null
  changes: ReadonlyArray<CalculatedCategoryChange>
  enabled: boolean
  identityKey: string
  comparisonKey: string
  now?: () => number
}) {
  const dataKey = JSON.stringify(changes)
  const key = `${identityKey}:${comparisonKey}:${dataKey}`
  const [state, setState] = useState<ExplanationState>({
    key,
    status: 'idle',
    message: null,
    explanations: EMPTY_EXPLANATIONS,
  })
  const generation = useRef(0)
  const inFlightGeneration = useRef<number | null>(null)
  const rateLimitedUntil = useRef(0)
  const previousIdentity = useRef(identityKey)
  const currentKey = useRef(key)

  useEffect(() => {
    currentKey.current = key
    if (previousIdentity.current !== identityKey) {
      previousIdentity.current = identityKey
      rateLimitedUntil.current = 0
    }
    generation.current += 1
    inFlightGeneration.current = null
  }, [identityKey, key])

  useEffect(
    () => () => {
      generation.current += 1
      inFlightGeneration.current = null
    },
    [],
  )

  const generate = useCallback(async () => {
    if (
      !action ||
      !enabled ||
      changes.length === 0 ||
      inFlightGeneration.current !== null
    )
      return
    if (now() < rateLimitedUntil.current) {
      setState((current) => ({
        key,
        status: 'rate_limited',
        message:
          'Alcanzaste temporalmente el límite de funciones inteligentes.',
        explanations:
          current.key === key ? current.explanations : EMPTY_EXPLANATIONS,
      }))
      return
    }
    const requestGeneration = ++generation.current
    inFlightGeneration.current = requestGeneration
    setState((current) => ({
      key,
      status: 'loading',
      message: null,
      explanations:
        current.key === key ? current.explanations : EMPTY_EXPLANATIONS,
    }))
    try {
      const response = await action.execute(changes)
      if (
        generation.current !== requestGeneration ||
        currentKey.current !== key
      )
        return
      const knownIds = new Set(changes.map(({ categoryId }) => categoryId))
      const next = new Map<string, string>()
      for (const item of response) {
        if (knownIds.has(item.categoryId) && !next.has(item.categoryId))
          next.set(item.categoryId, item.explanation)
      }
      setState({ key, status: 'success', message: null, explanations: next })
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
      setState((current) => ({
        key,
        status: presented.kind,
        message: `${presented.message} La comparación local sigue disponible.`,
        explanations:
          current.key === key ? current.explanations : EMPTY_EXPLANATIONS,
      }))
    } finally {
      if (inFlightGeneration.current === requestGeneration)
        inFlightGeneration.current = null
    }
  }, [action, changes, enabled, key, now])

  if (state.key !== key)
    return {
      status: 'idle' as const,
      message: null,
      explanations: EMPTY_EXPLANATIONS,
      generate,
    }
  return { ...state, generate }
}
