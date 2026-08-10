export function ErrorState({
  message = 'Ocurrió un error inesperado.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <section className="state-card error-state" role="alert">
      <h2>No pudimos cargar esta información</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="button secondary" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </section>
  )
}
