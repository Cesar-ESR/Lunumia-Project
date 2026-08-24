import type { ReceiptFlowFailure } from './receipt-flow-errors'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'

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
    <Surface className="ln-receipt-error" aria-labelledby="receipt-error-title">
      <div role="alert">
        <p className="eyebrow">No se completó el análisis</p>
        <h2 id="receipt-error-title">Puedes continuar</h2>
        <p>{failure.message}</p>
      </div>
      <div className="ln-receipt-actions">
        {failure.canRetryRecognition && onRetry ? (
          <Button onClick={onRetry}>Reintentar</Button>
        ) : null}
        {failure.kind === 'unauthenticated' && onSignIn ? (
          <Button onClick={onSignIn}>Iniciar sesión</Button>
        ) : null}
        <Button variant="secondary" onClick={onReplace}>
          Elegir otra imagen
        </Button>
        <Button variant="ghost" onClick={onManual}>
          Registrar manualmente
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Surface>
  )
}
