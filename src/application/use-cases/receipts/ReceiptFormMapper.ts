import type { Period } from '@domain/entities'
import type { ReceiptRecognitionResult } from '@domain/ports'
import type { AmountCents, DateOnly } from '@domain/value-objects'
import {
  validateReceiptAmount,
  type ReceiptAmountProposal,
  type ReceiptAmountValidation,
} from '@domain/rules'

export interface ReceiptExpenseDraft {
  description: string
  amount: AmountCents | null
  date: DateOnly | ''
  categoryId: string
  periodId: string
}

export interface ReceiptRecognitionProposal {
  draft: ReceiptExpenseDraft
  detectedCurrency: string | null
  confidence: number | null
  amountProposal: ReceiptAmountProposal
  amountValidation: ReceiptAmountValidation
}

export function mapReceiptToExpenseDraft(
  result: ReceiptRecognitionResult,
  periods: Period[],
  activePeriodId: string | null,
): ReceiptRecognitionProposal {
  const amountProposal: ReceiptAmountProposal = {
    subtotal: result.subtotal,
    tax: result.tax,
    tip: result.tip,
    discount: result.discount,
    otherFees: result.otherFees,
    total: result.total,
    amountPaid: result.amountPaid,
    amountEvidence: result.amountEvidence,
    amountAmbiguous: result.amountAmbiguous,
    currency: result.currency,
    confidence: result.confidence,
  }
  const amountValidation = validateReceiptAmount(amountProposal)
  return {
    draft: {
      description: result.merchant ?? '',
      amount:
        amountValidation.status === 'invalid'
          ? null
          : (result.total as AmountCents),
      date: result.date ?? '',
      categoryId: '',
      periodId: resolveReceiptPeriodId(result.date, periods, activePeriodId),
    },
    detectedCurrency: result.currency,
    confidence: result.confidence,
    amountProposal,
    amountValidation,
  }
}

export function createManualReceiptDraft(
  date: DateOnly,
  periods: Period[],
  activePeriodId: string | null,
): ReceiptExpenseDraft {
  return {
    description: '',
    amount: null,
    date,
    categoryId: '',
    periodId: resolveReceiptPeriodId(date, periods, activePeriodId),
  }
}

export function resolveReceiptPeriodId(
  date: DateOnly | null,
  periods: Period[],
  activePeriodId: string | null,
): string {
  const active = periods.find((period) => period.id === activePeriodId)
  if (date && active && active.startDate <= date && date <= active.endDate)
    return active.id
  if (date) {
    const matching = periods.find(
      (period) => period.startDate <= date && date <= period.endDate,
    )
    if (matching) return matching.id
  }
  return date ? '' : (active?.id ?? '')
}
