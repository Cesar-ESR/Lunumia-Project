import type { CategorySuggestionState } from '../hooks/useCategorySuggestion'

export function CategorySuggestionPanel({
  state,
  categoryName,
  onUse,
  onIgnore,
}: {
  state: CategorySuggestionState
  categoryName: string | null
  onUse(): void
  onIgnore(): void
}) {
  if (state.status === 'waiting' || state.status === 'idle') return null
  if (state.status === 'loading')
    return (
      <p className="ai-inline-status" role="status">
        Buscando una categoría…
      </p>
    )
  if (state.status === 'no_suggestion')
    return (
      <p className="ai-inline-status" role="status">
        No encontramos una sugerencia. Puedes elegir manualmente.
      </p>
    )
  if (
    state.status === 'rate_limited' ||
    state.status === 'unavailable' ||
    state.status === 'error'
  )
    return (
      <p className="ai-inline-status ai-inline-error" role="status">
        {state.message}
      </p>
    )
  if (state.status !== 'suggestion') return null
  if (!categoryName) return null
  return (
    <aside className="ai-suggestion" aria-live="polite">
      <header className="ai-suggestion__header">
        <span className="ai-label">Sugerencia inteligente</span>
      </header>
      <div className="ai-suggestion__content">
        <strong>Sugerencia: {categoryName}</strong>
        <p>Es una recomendación; tú decides si usarla.</p>
      </div>
      <div
        className="ai-actions"
        role="group"
        aria-label="Acciones de sugerencia"
      >
        <button type="button" className="button secondary" onClick={onUse}>
          Usar categoría
        </button>
        <button type="button" className="button ghost" onClick={onIgnore}>
          Ignorar
        </button>
      </div>
    </aside>
  )
}
