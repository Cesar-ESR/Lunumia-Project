import type { ReceiptFlowFailure } from './receipt-flow-errors'

export function ReceiptErrorPanel({
  failure,
  onRetry,
  onReplace,
  onManual,
  onCancel,
  onSignIn,
}: {
  failure: ReceiptFlowFailure
  onRetry?(): void
  onReplace(): void
  onManual(): void
  onCancel(): void
  onSignIn?(): void
}) {
  return (
    <section
      className="panel receipt-error"
      aria-labelledby="receipt-error-title"
    >
      <div role="alert">
        <p className="eyebrow">No se completó el análisis</p>
        <h2 id="receipt-error-title">Puedes continuar</h2>
        <p>{failure.message}</p>
      </div>
      <div className="receipt-preview-actions">
        {failure.canRetryRecognition && onRetry ? (
          <button className="button" onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
        {failure.kind === 'unauthenticated' && onSignIn ? (
          <button className="button" onClick={onSignIn}>
            Iniciar sesión
          </button>
        ) : null}
        <button className="button secondary" onClick={onReplace}>
          Elegir otra imagen
        </button>
        <button className="button ghost" onClick={onManual}>
          Registrar manualmente
        </button>
        <button className="button ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  )
}
