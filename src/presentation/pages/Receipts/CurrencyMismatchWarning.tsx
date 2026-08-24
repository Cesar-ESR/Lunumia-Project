export function CurrencyMismatchWarning({
  detectedCurrency,
  configuredCurrency,
  reviewed,
  onReviewedChange,
}: {
  detectedCurrency: string
  configuredCurrency: string
  reviewed: boolean
  onReviewedChange(value: boolean): void
}) {
  return (
    <Notice
      tone="warning"
      role="alert"
      title="Revisa la moneda detectada"
      message={
        <>
          <p>
            El recibo parece estar en {detectedCurrency}, pero tu moneda
            configurada es {configuredCurrency}. No convertiremos el importe.
          </p>
          <label className="ln-receipt-review-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => onReviewedChange(event.target.checked)}
            />
            Revisé el importe y deseo continuar en {configuredCurrency}.
          </label>
        </>
      }
    />
  )
}
import { Notice } from '../../components/Notice'
