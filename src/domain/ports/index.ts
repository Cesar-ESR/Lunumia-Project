import type { PeriodType } from '@domain/entities'
import type {
  AmountCents,
  DateOnly,
  SignedMoneyCents,
} from '@domain/value-objects'

export type SupportedReceiptMimeType = 'image/jpeg' | 'image/png'

export interface ReceiptRecognitionInput {
  imageBase64: string
  mimeType: SupportedReceiptMimeType
}

export interface ReceiptRecognitionResult {
  merchant: string | null
  date: DateOnly | null
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
  rawText: string | null
}

export interface ReceiptRecognitionProvider {
  recognize(input: ReceiptRecognitionInput): Promise<ReceiptRecognitionResult>
}
export interface CategorySuggestion {
  categoryId: string
  confidence: number
}

export interface PeriodCategoryBreakdown {
  categoryId: string
  categoryName: string
  total: AmountCents
  percentage: number
}

export interface PeriodTopExpense {
  description: string
  amount: AmountCents
}

export interface PeriodAggregatedData {
  totalIncome: AmountCents
  totalExpenses: AmountCents
  categoryBreakdown: ReadonlyArray<PeriodCategoryBreakdown>
  topExpenses?: ReadonlyArray<PeriodTopExpense>
  periodType: PeriodType
  startDate: DateOnly
  endDate: DateOnly
}

export interface PeriodSummary {
  text: string
  highlights: ReadonlyArray<string>
}

export interface CalculatedCategoryChange {
  categoryId: string
  categoryName: string
  currentAmount: AmountCents
  previousAmount: AmountCents
  changePercentage: number | null
  absoluteChange: SignedMoneyCents
}

export interface CategoryChangeExplanation {
  categoryId: string
  explanation: string
}

export interface AIInsightsProvider {
  suggestCategory(
    description: string,
    categories: ReadonlyArray<{ id: string; name: string }>,
  ): Promise<CategorySuggestion | null>
  generatePeriodSummary(
    aggregatedData: PeriodAggregatedData,
  ): Promise<PeriodSummary>
  explainCategoryChanges(
    changes: ReadonlyArray<CalculatedCategoryChange>,
  ): Promise<ReadonlyArray<CategoryChangeExplanation>>
}
