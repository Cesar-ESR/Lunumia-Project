import type { OCRProvider } from './OCRProvider.ts'

export class MockOCRProvider implements OCRProvider {
  async recognize() {
    return Promise.resolve({
      merchant: 'Comercio de prueba',
      date: '2026-01-15',
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
      confidence: 0.99,
      rawText: 'MOCK RECEIPT',
    })
  }
}
