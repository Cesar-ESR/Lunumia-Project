export const RECEIPT_AMOUNT_CONFIDENCE_REVIEW_THRESHOLD = 0.5
export const RECEIPT_AMOUNT_ARITHMETIC_TOLERANCE_CENTS = 1

export type ReceiptAmountValidationStatus = 'valid' | 'needs_review' | 'invalid'

export type ReceiptAmountValidationReason =
  | 'total_missing'
  | 'total_non_positive'
  | 'total_not_integer_cents'
  | 'total_unsafe'
  | 'currency_missing'
  | 'currency_unsupported'
  | 'evidence_missing'
  | 'confidence_low'
  | 'subtotal_tax_total_mismatch'
  | 'amount_paid_mismatch'
  | 'amount_ambiguous'

export interface ReceiptAmountProposal {
  subtotal: number | null
  tax: number | null
  tip: number | null
  discount: number | null
  otherFees: number | null
  total: number | null
  amountPaid: number | null
  amountEvidence: string | null
  amountAmbiguous: boolean
  currency: string | null
  confidence: number | null
}

export interface ReceiptAmountValidation {
  status: ReceiptAmountValidationStatus
  reasons: readonly ReceiptAmountValidationReason[]
  totalCents: number | null
}

/** Pure review of an OCR suggestion. It never calculates or replaces total. */
export function validateReceiptAmount(
  proposal: ReceiptAmountProposal,
  supportedCurrencies?: readonly string[],
): ReceiptAmountValidation {
  const reasons: ReceiptAmountValidationReason[] = []
  const { total } = proposal

  if (total === null) reasons.push('total_missing')
  else if (!Number.isFinite(total) || !Number.isInteger(total))
    reasons.push('total_not_integer_cents')
  else if (!Number.isSafeInteger(total)) reasons.push('total_unsafe')
  else if (total <= 0) reasons.push('total_non_positive')

  if (reasons.length) return { status: 'invalid', reasons, totalCents: total }

  if (!proposal.currency) reasons.push('currency_missing')
  else if (
    supportedCurrencies &&
    !supportedCurrencies.includes(proposal.currency)
  )
    reasons.push('currency_unsupported')
  if (!proposal.amountEvidence?.trim()) reasons.push('evidence_missing')
  if (
    proposal.confidence !== null &&
    proposal.confidence < RECEIPT_AMOUNT_CONFIDENCE_REVIEW_THRESHOLD
  )
    reasons.push('confidence_low')
  if (proposal.amountAmbiguous) reasons.push('amount_ambiguous')

  if (proposal.subtotal !== null && proposal.tax !== null) {
    const expected =
      proposal.subtotal +
      proposal.tax +
      (proposal.tip ?? 0) +
      (proposal.otherFees ?? 0) -
      (proposal.discount ?? 0)
    if (
      !Number.isSafeInteger(expected) ||
      Math.abs(expected - total!) > RECEIPT_AMOUNT_ARITHMETIC_TOLERANCE_CENTS
    )
      reasons.push('subtotal_tax_total_mismatch')
  }
  if (proposal.amountPaid !== null && proposal.amountPaid !== total)
    reasons.push('amount_paid_mismatch')

  return {
    status: reasons.length ? 'needs_review' : 'valid',
    reasons,
    totalCents: total,
  }
}
