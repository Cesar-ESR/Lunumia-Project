import { AIInsightsFunctionError } from '../errors.ts'
import type {
  CategoryChangeExplanationsOutput,
  CategorySuggestionOutput,
  ExplainChangesInput,
  PeriodSummaryInput,
  PeriodSummaryOutput,
  SuggestCategoryInput,
} from '../contracts.ts'
import type { AIProvider } from './AIProvider.ts'

export interface MockAIProviderOptions {
  delayMs?: number
  failWith?: MockAIProviderFailure
  categorySuggestion?: CategorySuggestionOutput
  periodSummary?: PeriodSummaryOutput
  categoryExplanations?: CategoryChangeExplanationsOutput
}

export type MockAIProviderFailure =
  | 'network_error'
  | 'rate_limited'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'unauthenticated'
  | 'unknown'

export type MockAIProviderMethod =
  'suggestCategory' | 'generatePeriodSummary' | 'explainCategoryChanges'

export interface MockAIProviderCall {
  method: MockAIProviderMethod
  payload: Readonly<Record<string, number | string>>
}

export class MockAIProvider implements AIProvider {
  private readonly recordedCalls: MockAIProviderCall[] = []

  constructor(private readonly options: MockAIProviderOptions = {}) {}

  get calls(): ReadonlyArray<MockAIProviderCall> {
    return this.recordedCalls
  }

  callCount(method: MockAIProviderMethod): number {
    return this.recordedCalls.filter((call) => call.method === method).length
  }

  async suggestCategory(
    input: SuggestCategoryInput,
    signal: AbortSignal,
  ): Promise<CategorySuggestionOutput> {
    this.record('suggestCategory', {
      descriptionLength: input.description.length,
      categoryCount: input.categories.length,
    })
    await this.beforeResponse(signal)
    if ('categorySuggestion' in this.options)
      return this.options.categorySuggestion ?? null
    const description = normalize(input.description)
    const category = input.categories.find(({ name }) => {
      const normalizedName = normalize(name)
      return normalizedName.length > 0 && description.includes(normalizedName)
    })
    return category ? { categoryId: category.id, confidence: 0.8 } : null
  }

  async generatePeriodSummary(
    input: PeriodSummaryInput,
    signal: AbortSignal,
  ): Promise<PeriodSummaryOutput> {
    this.record('generatePeriodSummary', {
      categoryCount: input.aggregatedData.categoryBreakdown.length,
      periodType: input.aggregatedData.periodType,
      topExpenseCount: input.aggregatedData.topExpenses?.length ?? 0,
    })
    await this.beforeResponse(signal)
    if (this.options.periodSummary) return this.options.periodSummary
    const { aggregatedData } = input
    return {
      text: `Resumen ${aggregatedData.periodType} del ${aggregatedData.startDate} al ${aggregatedData.endDate}.`,
      highlights: aggregatedData.categoryBreakdown
        .slice(0, 5)
        .map(({ categoryName }) => `Actividad registrada en ${categoryName}.`),
    }
  }

  async explainCategoryChanges(
    input: ExplainChangesInput,
    signal: AbortSignal,
  ): Promise<CategoryChangeExplanationsOutput> {
    this.record('explainCategoryChanges', {
      changeCount: input.changes.length,
    })
    await this.beforeResponse(signal)
    if (this.options.categoryExplanations)
      return this.options.categoryExplanations
    return input.changes.map(({ categoryId, categoryName }) => ({
      categoryId,
      explanation: `El cambio de ${categoryName} refleja los datos comparados.`,
    }))
  }

  private async beforeResponse(signal: AbortSignal): Promise<void> {
    if (this.options.failWith === 'network_error')
      throw new TypeError('Simulated network error')
    if (this.options.failWith)
      throw new AIInsightsFunctionError(this.options.failWith)
    if (!this.options.delayMs) return
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeout)
        reject(new AIInsightsFunctionError('provider_timeout'))
      }
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, this.options.delayMs)
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private record(
    method: MockAIProviderMethod,
    payload: MockAIProviderCall['payload'],
  ): void {
    this.recordedCalls.push({ method, payload })
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}
