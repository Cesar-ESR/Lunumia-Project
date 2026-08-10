import { OCRFunctionError } from '../errors/OCRFunctionError.ts'
import { MockOCRProvider } from './MockOCRProvider.ts'
import type { OCRProvider } from './OCRProvider.ts'

export interface OCRProviderEnvironment {
  provider: string
  runtimeEnvironment: string
}

const nonProductionEnvironments = new Set(['development', 'local', 'test'])

export function createOCRProvider(
  environment: OCRProviderEnvironment,
): OCRProvider {
  if (environment.provider !== 'mock')
    throw new OCRFunctionError('provider_unavailable')
  if (!nonProductionEnvironments.has(environment.runtimeEnvironment))
    throw new OCRFunctionError('provider_unavailable')
  return new MockOCRProvider()
}
