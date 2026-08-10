import { AIInsightsFunctionError } from '../errors.ts'
import type { AIProvider } from './AIProvider.ts'
import { GroqAIProvider } from './GroqAIProvider.ts'
import { MockAIProvider } from './MockAIProvider.ts'

export interface AIProviderEnvironment {
  provider: string
  runtimeEnvironment: string
  groqApiKey?: string
  groqModel?: string
}

const nonProductionEnvironments = new Set(['development', 'local', 'test'])

export function createAIProvider(
  environment: AIProviderEnvironment,
): AIProvider {
  if (environment.provider === 'groq') {
    return new GroqAIProvider({
      apiKey: environment.groqApiKey ?? '',
      model: environment.groqModel ?? '',
    })
  }
  if (
    environment.provider === 'mock' &&
    nonProductionEnvironments.has(environment.runtimeEnvironment)
  )
    return new MockAIProvider()
  throw new AIInsightsFunctionError('provider_unavailable')
}
