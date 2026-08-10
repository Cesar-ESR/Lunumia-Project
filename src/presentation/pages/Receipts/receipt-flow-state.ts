import type { ReceiptExpenseDraft } from '@application/use-cases/receipts'
import type { CapturedImage } from '@infrastructure/platform'
import type { ReceiptFlowFailure } from './receipt-flow-errors'

export interface ReceiptFormContext {
  image: CapturedImage | null
  draft: ReceiptExpenseDraft
  detectedCurrency: string | null
  confidence: number | null
}

export type ReceiptFlowState =
  | { status: 'idle' }
  | {
      status: 'selecting'
      source: 'camera' | 'gallery'
      image: CapturedImage | null
    }
  | { status: 'preview'; image: CapturedImage }
  | { status: 'recognizing'; image: CapturedImage }
  | ({ status: 'editing' | 'submitting' } & ReceiptFormContext)
  | {
      status: 'error'
      image: CapturedImage | null
      failure: ReceiptFlowFailure
    }
  | { status: 'success' }
