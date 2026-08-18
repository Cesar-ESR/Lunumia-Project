import { InvalidOCRResponseError } from '@application/contracts'
import type {
  ReceiptRecognitionInput,
  ReceiptRecognitionProvider,
  ReceiptRecognitionResult,
} from '@domain/ports'
import {
  ReceiptRecognitionError,
  type ReceiptRecognitionErrorKind,
} from '@infrastructure/ocr'

export type MockOCRScenarioName =
  | 'complete'
  | 'partial'
  | 'no_fields'
  | 'low_confidence'
  | 'currency_mismatch'
  | 'timeout'
  | 'network_error'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'unknown'

export interface MockOCRScenario {
  name: MockOCRScenarioName
  delayMs?: number
  result?: ReceiptRecognitionResult
}

export interface MockOCRCall {
  order: number
  mimeType: ReceiptRecognitionInput['mimeType']
  encodedLength: number
}

const completeResult: ReceiptRecognitionResult = {
  merchant: 'Papelería Centro',
  date: '2026-08-02',
  subtotal: 10_000,
  tax: 2_345,
  tip: null,
  discount: null,
  otherFees: null,
  total: 12_345,
  amountPaid: 12_345,
  amountEvidence: 'TOTAL 123.45',
  amountAmbiguous: false,
  currency: 'MXN',
  confidence: 0.98,
  rawText: 'fixture text returned but never retained by the fake',
}

const errorKindByScenario: Partial<
  Record<MockOCRScenarioName, ReceiptRecognitionErrorKind>
> = {
  timeout: 'provider_timeout',
  network_error: 'network_error',
  rate_limited: 'rate_limited',
  provider_unavailable: 'provider_unavailable',
  unknown: 'unknown',
}

export class ConfigurableMockOCRProvider implements ReceiptRecognitionProvider {
  readonly calls: MockOCRCall[] = []

  constructor(private readonly scenario: MockOCRScenario) {}

  get callCount(): number {
    return this.calls.length
  }

  async recognize(
    input: ReceiptRecognitionInput,
  ): Promise<ReceiptRecognitionResult> {
    this.calls.push({
      order: this.calls.length + 1,
      mimeType: input.mimeType,
      encodedLength: input.imageBase64.length,
    })
    if (this.scenario.delayMs)
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.scenario.delayMs),
      )

    const errorKind = errorKindByScenario[this.scenario.name]
    if (errorKind) throw new ReceiptRecognitionError(errorKind)
    if (this.scenario.name === 'invalid_response')
      throw new InvalidOCRResponseError()
    if (this.scenario.result) return structuredClone(this.scenario.result)

    switch (this.scenario.name) {
      case 'complete':
        return structuredClone(completeResult)
      case 'partial':
        return { ...completeResult, date: null, currency: null, rawText: null }
      case 'no_fields':
        return {
          merchant: null,
          date: null,
          subtotal: null,
          tax: null,
          tip: null,
          discount: null,
          otherFees: null,
          total: null,
          amountPaid: null,
          amountEvidence: null,
          amountAmbiguous: false,
          currency: null,
          confidence: 0,
          rawText: null,
        }
      case 'low_confidence':
        return { ...completeResult, confidence: 0.2 }
      case 'currency_mismatch':
        return { ...completeResult, currency: 'USD' }
      default:
        throw new ReceiptRecognitionError('unknown')
    }
  }
}
