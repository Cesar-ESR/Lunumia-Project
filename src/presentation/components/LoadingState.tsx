export function LoadingState({
  message = 'Cargando…',
  variant = 'spinner',
}: {
  message?: string
  variant?: 'spinner' | 'skeleton'
}) {
  return (
    <div
      className="ln-state ln-state--loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {variant === 'spinner' ? (
        <span className="ln-spinner" aria-hidden="true" />
      ) : (
        <span className="ln-skeleton" aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  )
}
