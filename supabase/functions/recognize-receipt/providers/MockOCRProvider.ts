import type { OCRProvider } from './OCRProvider.ts'

export class MockOCRProvider implements OCRProvider {
  async recognize() {
    return Promise.resolve({
      merchant: 'Comercio de prueba',
      date: '2026-01-15',
      total: 12_345,
      currency: 'MXN',
      confidence: 0.99,
      rawText: 'MOCK RECEIPT',
    })
  }
}
