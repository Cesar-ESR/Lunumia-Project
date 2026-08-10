export function LoadingState({ message = 'Cargando…' }: { message?: string }) {
  return (
    <div className="state-card" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {message}
    </div>
  )
}
