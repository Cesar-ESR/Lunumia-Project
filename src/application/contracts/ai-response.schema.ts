import type {
  CategoryChangeExplanation,
  CategorySuggestion,
  PeriodSummary,
  PlanningAnalysisResponse,
} from '@domain/ports'
import { z } from 'zod'

export class InvalidAIResponseError extends Error {
  readonly code = 'invalid_ai_response' as const

  constructor() {
    super('La respuesta de inteligencia artificial no es válida.')
    this.name = 'InvalidAIResponseError'
  }
}

export const CategorySuggestionSchema = z
  .object({
    categoryId: z.string().uuid(),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict()
  .nullable()

export const PeriodSummarySchema = z
  .object({
    text: z.string().trim().min(1).max(1_000),
    highlights: z.array(z.string().trim().min(1).max(200)).max(5),
  })
  .strict()

export const PlanningAnalysisResponseSchema = z
  .object({
    summary: z.string().trim().min(1).max(600),
    observations: z.array(z.string().trim().min(1).max(200)).max(4),
    considerations: z.array(z.string().trim().min(1).max(200)).max(3),
  })
  .strict()

const CategoryChangeExplanationItemSchema = z
  .object({
    categoryId: z.string().uuid(),
    explanation: z.string().trim().min(1).max(500),
  })
  .strict()

export const CategoryChangeExplanationSchema = z
  .array(CategoryChangeExplanationItemSchema)
  .refine(
    (items) =>
      new Set(items.map(({ categoryId }) => categoryId)).size === items.length,
    'Los IDs de categoría deben ser únicos.',
  )

export function parseCategorySuggestion(
  value: unknown,
  knownCategoryIds: ReadonlySet<string>,
): CategorySuggestion | null {
  const parsed = CategorySuggestionSchema.safeParse(value)
  if (
    !parsed.success ||
    (parsed.data !== null && !knownCategoryIds.has(parsed.data.categoryId))
  )
    throw new InvalidAIResponseError()
  return parsed.data
}

export function parsePeriodSummary(value: unknown): PeriodSummary {
  const parsed = PeriodSummarySchema.safeParse(value)
  if (!parsed.success) throw new InvalidAIResponseError()
  return parsed.data
}

export function parsePlanningAnalysisResponse(
  value: unknown,
): PlanningAnalysisResponse {
  const parsed = PlanningAnalysisResponseSchema.safeParse(value)
  if (!parsed.success) throw new InvalidAIResponseError()
  return parsed.data
}

export function parseCategoryChangeExplanations(
  value: unknown,
  requestedCategoryIds: ReadonlySet<string>,
): ReadonlyArray<CategoryChangeExplanation> {
  const parsed = CategoryChangeExplanationSchema.safeParse(value)
  if (
    !parsed.success ||
    parsed.data.length > requestedCategoryIds.size ||
    parsed.data.some(({ categoryId }) => !requestedCategoryIds.has(categoryId))
  )
    throw new InvalidAIResponseError()
  return parsed.data
}
