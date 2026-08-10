import type {
  CategoryChangeExplanationsOutput,
  CategorySuggestionOutput,
  ExplainChangesInput,
  PeriodSummaryInput,
  PeriodSummaryOutput,
  SuggestCategoryInput,
} from '../contracts.ts'

export interface AIProvider {
  suggestCategory(
    input: SuggestCategoryInput,
    signal: AbortSignal,
  ): Promise<CategorySuggestionOutput>
  generatePeriodSummary(
    input: PeriodSummaryInput,
    signal: AbortSignal,
  ): Promise<PeriodSummaryOutput>
  explainCategoryChanges(
    input: ExplainChangesInput,
    signal: AbortSignal,
  ): Promise<CategoryChangeExplanationsOutput>
}
