import {
  validateReceiptAmount,
  type ReceiptAmountProposal,
  type ReceiptAmountValidationReason,
} from '@domain/rules'
import { formatCentsForInput } from '../../utils/money-input'

const reasonMessages: Record<ReceiptAmountValidationReason, string> = {
  total_missing: 'No pudimos identificar el total.',
  total_non_positive: 'El monto detectado debe ser mayor que cero.',
  total_not_integer_cents: 'El monto detectado no tiene un formato válido.',
  total_unsafe: 'El monto detectado está fuera del rango permitido.',
  currency_missing: 'No se pudo identificar la moneda.',
  currency_unsupported: 'La moneda detectada no coincide con la configurada.',
  evidence_missing: 'No se encontró el texto visible que identifica el total.',
  confidence_low: 'La lectura del monto no fue suficientemente clara.',
  subtotal_tax_total_mismatch:
    'El subtotal y los componentes detectados no parecen coincidir con el total.',
  amount_paid_mismatch:
    'El total y el monto pagado detectados no parecen coincidir.',
  amount_ambiguous: 'Se encontraron varios montos que podrían ser el total.',
}

export function ReceiptAmountValidationSection({
  proposal,
  amountCents,
  configuredCurrency,
}: {
  proposal: ReceiptAmountProposal | null
  amountCents: number | null
  configuredCurrency: string
}) {
  if (!proposal)
    return (
      <section
        className="receipt-amount-validation"
        aria-labelledby="amount-validation-title"
      >
        <h3 id="amount-validation-title">Validación del monto</h3>
        <p>No pudimos identificar el total. Ingresa el monto manualmente.</p>
      </section>
    )

  const original = validateReceiptAmount(proposal, [configuredCurrency])
  const manuallyCorrected =
    amountCents !== null &&
    amountCents > 0 &&
    Number.isSafeInteger(amountCents) &&
    amountCents !== proposal.total
  const status = manuallyCorrected ? 'valid' : original.status
  const reasons = manuallyCorrected ? [] : original.reasons

  return (
    <section
      className="receipt-amount-validation"
      aria-labelledby="amount-validation-title"
    >
      <h3 id="amount-validation-title">Validación del monto</h3>
      <p>
        <span>Monto detectado</span>{' '}
        <strong>
          {proposal.total !== null && Number.isSafeInteger(proposal.total)
            ? `${formatCentsForInput(proposal.total)} ${proposal.currency ?? ''}`.trim()
            : 'Sin monto'}
        </strong>
      </p>
      <p>
        <span>Moneda</span>{' '}
        <strong>{proposal.currency ?? 'No identificada'}</strong>
      </p>
      {proposal.amountEvidence ? (
        <p>
          <span>Texto encontrado</span>{' '}
          <strong>{proposal.amountEvidence}</strong>
        </p>
      ) : null}
      <p role="status">
        <strong>
          {status === 'valid'
            ? manuallyCorrected
              ? 'Monto corregido, listo para confirmar'
              : 'Listo para confirmar'
            : status === 'needs_review'
              ? 'Revisa el monto antes de continuar'
              : 'Ingresa un monto válido manualmente'}
        </strong>
      </p>
      {reasons.length ? (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reasonMessages[reason]}</li>
          ))}
        </ul>
      ) : null}
      <p>El monto editable aparece a continuación y tu corrección prevalece.</p>
    </section>
  )
}
