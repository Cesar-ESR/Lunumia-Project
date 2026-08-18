import { OCRFunctionError } from '../errors/OCRFunctionError.ts'
import {
  GROQ_OCR_PROVIDER,
  GroqVisionOCRProvider,
} from './GroqVisionOCRProvider.ts'
import { MockOCRProvider } from './MockOCRProvider.ts'
import type { OCRProvider } from './OCRProvider.ts'

export interface OCRProviderEnvironment {
  provider: string
  runtimeEnvironment: string
  groqApiKey?: string
  ocrModel?: string
}

const nonProductionEnvironments = new Set(['development', 'local', 'test'])

export function createOCRProvider(
  environment: OCRProviderEnvironment,
): OCRProvider {
  if (environment.provider === GROQ_OCR_PROVIDER) {
    return new GroqVisionOCRProvider({
      apiKey: environment.groqApiKey ?? '',
      model: environment.ocrModel ?? '',
    })
  }
  if (
    environment.provider === 'mock' &&
    nonProductionEnvironments.has(environment.runtimeEnvironment)
  )
    return new MockOCRProvider()
  else throw new OCRFunctionError('provider_unavailable')
}
