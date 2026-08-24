import type {
  CategoryChangeExplanationsOutput,
  CategorySuggestionOutput,
  ExplainChangesInput,
  PeriodSummaryInput,
  PeriodSummaryOutput,
  PlanningAnalysisInput,
  PlanningAnalysisOutput,
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
  analyzePlanning(
    input: PlanningAnalysisInput,
    signal: AbortSignal,
  ): Promise<PlanningAnalysisOutput>
}
