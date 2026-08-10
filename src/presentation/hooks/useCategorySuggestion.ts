import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '@domain/entities'
import type { CategorySuggestion } from '@domain/ports'
import { presentAIError } from '../utils/ai-errors'

export const CATEGORY_SUGGESTION_DEBOUNCE_MS = 500
export const CATEGORY_SUGGESTION_MIN_LENGTH = 3

export type CategorySuggestionState =
  | { status: 'idle' | 'waiting' | 'loading' | 'no_suggestion' }
  | { status: 'suggestion'; suggestion: CategorySuggestion }
  | { status: 'rate_limited' | 'unavailable' | 'error'; message: string }

export interface SuggestExpenseCategoryAction {
  execute(
    description: string,
    categories: readonly Category[],
    ownerId: string,
  ): Promise<CategorySuggestion | null>
}

export function useCategorySuggestion({
  action,
  enabled,
  identityKey,
  ownerId,
  description,
  categories,
  debounceMs = CATEGORY_SUGGESTION_DEBOUNCE_MS,
  now = Date.now,
}: {
  action: SuggestExpenseCategoryAction | null
  enabled: boolean
  identityKey: string
  ownerId: string
  description: string
  categories: readonly Category[]
  debounceMs?: number
  now?: () => number
}) {
  const [state, setState] = useState<CategorySuggestionState>({
    status: 'idle',
  })
  const generation = useRef(0)
  const activeKey = useRef<string | null>(null)
  const suppressedDescription = useRef<string | null>(null)
  const rateLimitedUntil = useRef(0)
  const stateIdentity = useRef(identityKey)
  const normalizedDescription = description.trim()
  const activeCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.ownerId === ownerId && category.deletedAt === null,
      ),
    [categories, ownerId],
  )
  const categoriesKey = activeCategories
    .map(
      ({ id, updatedAt, deletedAt }) => `${id}:${updatedAt}:${deletedAt ?? ''}`,
    )
    .join('|')

  useEffect(() => {
    const requestGeneration = ++generation.current
    activeKey.current = null
    if (stateIdentity.current !== identityKey) {
      stateIdentity.current = identityKey
      rateLimitedUntil.current = 0
      suppressedDescription.current = null
    }
    if (
      !action ||
      !enabled ||
      ownerId.startsWith('guest:') ||
      normalizedDescription.length < CATEGORY_SUGGESTION_MIN_LENGTH ||
      activeCategories.length === 0 ||
      suppressedDescription.current === normalizedDescription
    ) {
      setState({ status: 'idle' })
      return
    }
    if (now() < rateLimitedUntil.current) {
      setState({
        status: 'rate_limited',
        message:
          'Las sugerencias inteligentes están temporalmente limitadas. Puedes elegir la categoría manualmente.',
      })
      return
    }
    const requestKey = `${identityKey}:${normalizedDescription}:${categoriesKey}`
    setState({ status: 'waiting' })
    const timeoutId = window.setTimeout(() => {
      if (generation.current !== requestGeneration) return
      activeKey.current = requestKey
      setState({ status: 'loading' })
      void action
        .execute(normalizedDescription, activeCategories, ownerId)
        .then(
          (suggestion) => {
            if (
              generation.current !== requestGeneration ||
              activeKey.current !== requestKey
            )
              return
            activeKey.current = null
            if (
              !suggestion ||
              !activeCategories.some(
                (category) =>
                  category.id === suggestion.categoryId &&
                  category.ownerId === ownerId &&
                  category.deletedAt === null,
              )
            ) {
              setState({ status: 'no_suggestion' })
              return
            }
            setState({ status: 'suggestion', suggestion })
          },
          (reason) => {
            if (generation.current !== requestGeneration) return
            activeKey.current = null
            const presented = presentAIError(reason)
            if (presented.kind === 'rate_limited') {
              rateLimitedUntil.current =
                now() + (presented.retryAfterSeconds ?? 60) * 1_000
              setState({
                status: 'rate_limited',
                message:
                  'Las sugerencias inteligentes están temporalmente limitadas. Puedes elegir la categoría manualmente.',
              })
            } else {
              setState({
                status: 'unavailable',
                message: `${presented.message} Puedes elegir la categoría manualmente.`,
              })
            }
          },
        )
    }, debounceMs)
    return () => {
      window.clearTimeout(timeoutId)
      if (generation.current === requestGeneration) generation.current += 1
      if (activeKey.current === requestKey) activeKey.current = null
    }
  }, [
    action,
    activeCategories,
    categoriesKey,
    debounceMs,
    enabled,
    identityKey,
    normalizedDescription,
    now,
    ownerId,
  ])

  const suppressCurrent = useCallback(() => {
    suppressedDescription.current = normalizedDescription
    generation.current += 1
    activeKey.current = null
    setState({ status: 'idle' })
  }, [normalizedDescription])

  const invalidate = useCallback(() => {
    generation.current += 1
    activeKey.current = null
    suppressedDescription.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, suppressCurrent, invalidate }
}
