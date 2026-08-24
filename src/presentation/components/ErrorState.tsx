export function ErrorState({
  title = 'No pudimos cargar esta información',
  message = 'Ocurrió un error inesperado.',
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <section className="ln-state ln-state--error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="ln-button ln-button--secondary"
          onClick={onRetry}
        >
          Reintentar
        </button>
      ) : null}
    </section>
  )
}
