import { z } from 'zod'
import { AIInsightsFunctionError } from './errors.ts'

export const AI_LIMITS = {
  description: 2_000,
  categories: 50,
  categoryName: 100,
  topExpenses: 20,
  topExpenseDescription: 200,
} as const

const dateOnlySchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return (
    year !== undefined &&
    month !== undefined &&
    day !== undefined &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
})
const amountCentsSchema = z.number().int().finite().nonnegative()
const signedCentsSchema = z.number().int().finite().safe()
const uniqueCategoryIds = <T extends { categoryId: string }>(items: T[]) =>
  new Set(items.map(({ categoryId }) => categoryId)).size === items.length

const availableCategorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(AI_LIMITS.categoryName),
  })
  .strict()

export const SuggestCategoryRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(AI_LIMITS.description),
    categories: z.array(availableCategorySchema).max(AI_LIMITS.categories),
  })
  .strict()
  .refine(
    ({ categories }) =>
      new Set(categories.map(({ id }) => id)).size === categories.length,
  )

const categoryBreakdownSchema = z
  .object({
    categoryId: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(AI_LIMITS.categoryName),
    totalCents: amountCentsSchema,
    percentage: z.number().finite(),
  })
  .strict()

const topExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(AI_LIMITS.topExpenseDescription),
    amountCents: amountCentsSchema,
  })
  .strict()

const legacyCategoryBreakdownSchema = z
  .object({
    categoryId: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(AI_LIMITS.categoryName),
    total: amountCentsSchema,
    percentage: z.number().finite(),
  })
  .strict()

const legacyTopExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(AI_LIMITS.topExpenseDescription),
    amount: amountCentsSchema,
  })
  .strict()

export const LegacyPeriodSummaryRequestSchema = z
  .object({
    aggregatedData: z
      .object({
        totalIncome: amountCentsSchema,
        totalExpenses: amountCentsSchema,
        categoryBreakdown: z
          .array(legacyCategoryBreakdownSchema)
          .max(AI_LIMITS.categories)
          .refine(uniqueCategoryIds),
        topExpenses: z
          .array(legacyTopExpenseSchema)
          .max(AI_LIMITS.topExpenses)
          .optional(),
        periodType: z.enum(['monthly', 'biweekly']),
        startDate: dateOnlySchema,
        endDate: dateOnlySchema,
      })
      .strict()
      .refine(({ startDate, endDate }) => startDate <= endDate),
  })
  .strict()

export const HistoricalAnalysisRequestSchema = z
  .object({
    context: z.literal('historical'),
    facts: z
      .object({
        receivedIncomeCents: amountCentsSchema,
        expenseCents: amountCentsSchema,
        categoryBreakdown: z
          .array(categoryBreakdownSchema)
          .max(AI_LIMITS.categories)
          .refine(uniqueCategoryIds),
        topExpenses: z
          .array(topExpenseSchema)
          .max(AI_LIMITS.topExpenses)
          .optional(),
        periodType: z.enum(['monthly', 'biweekly']),
        startDate: dateOnlySchema,
        endDate: dateOnlySchema,
      })
      .strict()
      .refine(({ startDate, endDate }) => startDate <= endDate),
  })
  .strict()

export const PlanningAnalysisRequestSchema = z
  .object({
    context: z.literal('planning'),
    facts: z
      .object({
        currentBalanceCents: signedCentsSchema.nullable(),
        committedCents: amountCentsSchema,
        expectedIncomeCents: amountCentsSchema,
        projectedAvailableCents: signedCentsSchema.nullable(),
        projectedClosingBalanceCents: signedCentsSchema.nullable(),
        projectionCoverage: z.enum(['full_period', 'overdue_only']),
        projectionHorizonEnd: dateOnlySchema.nullable(),
      })
      .strict(),
  })
  .strict()

export const AIAnalysisRequestSchema = z.discriminatedUnion('context', [
  HistoricalAnalysisRequestSchema,
  PlanningAnalysisRequestSchema,
])

export const PeriodSummaryRequestSchema = HistoricalAnalysisRequestSchema

const categoryChangeSchema = z
  .object({
    categoryId: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(AI_LIMITS.categoryName),
    currentAmount: amountCentsSchema,
    previousAmount: amountCentsSchema,
    changePercentage: z.number().finite().nullable(),
    absoluteChange: z.number().int().finite(),
  })
  .strict()

export const ExplainChangesRequestSchema = z
  .object({
    changes: z
      .array(categoryChangeSchema)
      .max(AI_LIMITS.categories)
      .refine(uniqueCategoryIds),
  })
  .strict()

export const CategorySuggestionResponseSchema = z
  .object({
    categoryId: z.string().uuid(),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict()
  .nullable()

export const PeriodSummaryResponseSchema = z
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

export const CategoryChangeExplanationsResponseSchema = z
  .array(
    z
      .object({
        categoryId: z.string().uuid(),
        explanation: z.string().trim().min(1).max(500),
      })
      .strict(),
  )
  .refine(uniqueCategoryIds)

export type SuggestCategoryInput = z.infer<typeof SuggestCategoryRequestSchema>
export type PeriodSummaryInput = z.infer<typeof PeriodSummaryRequestSchema>
export type LegacyPeriodSummaryInput = z.infer<
  typeof LegacyPeriodSummaryRequestSchema
>
export type PlanningAnalysisInput = z.infer<
  typeof PlanningAnalysisRequestSchema
>
export type AIAnalysisInput = z.infer<typeof AIAnalysisRequestSchema>
export type ExplainChangesInput = z.infer<typeof ExplainChangesRequestSchema>
export type CategorySuggestionOutput = z.infer<
  typeof CategorySuggestionResponseSchema
>
export type PeriodSummaryOutput = z.infer<typeof PeriodSummaryResponseSchema>
export type PlanningAnalysisOutput = z.infer<
  typeof PlanningAnalysisResponseSchema
>
export type CategoryChangeExplanationsOutput = z.infer<
  typeof CategoryChangeExplanationsResponseSchema
>

export function parseSuggestCategoryRequest(value: unknown) {
  if (
    isRecord(value) &&
    typeof value.description === 'string' &&
    value.description.length > AI_LIMITS.description
  )
    throw new AIInsightsFunctionError('description_too_long')
  guardCategoryLimit(value, 'categories')
  return parseRequest(SuggestCategoryRequestSchema, value)
}

export function parsePeriodSummaryRequest(value: unknown) {
  if (isRecord(value) && isRecord(value.facts))
    guardCategoryLimit(value.facts, 'categoryBreakdown')
  if (isRecord(value) && isRecord(value.aggregatedData))
    guardCategoryLimit(value.aggregatedData, 'categoryBreakdown')

  const canonical = HistoricalAnalysisRequestSchema.safeParse(value)
  if (canonical.success) return canonical.data

  const legacy = LegacyPeriodSummaryRequestSchema.safeParse(value)
  if (!legacy.success) throw new AIInsightsFunctionError('invalid_request')
  return normalizeLegacyPeriodSummaryRequest(legacy.data)
}

export function normalizeLegacyPeriodSummaryRequest(
  legacy: LegacyPeriodSummaryInput,
): PeriodSummaryInput {
  const data = legacy.aggregatedData
  return HistoricalAnalysisRequestSchema.parse({
    context: 'historical',
    facts: {
      receivedIncomeCents: data.totalIncome,
      expenseCents: data.totalExpenses,
      categoryBreakdown: data.categoryBreakdown.map((category) => ({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        totalCents: category.total,
        percentage: category.percentage,
      })),
      topExpenses: data.topExpenses?.map((expense) => ({
        description: expense.description,
        amountCents: expense.amount,
      })),
      periodType: data.periodType,
      startDate: data.startDate,
      endDate: data.endDate,
    },
  })
}

export function parsePlanningAnalysisRequest(
  value: unknown,
): PlanningAnalysisInput {
  const input = parseRequest(PlanningAnalysisRequestSchema, value)
  const facts = input.facts
  if (
    facts.currentBalanceCents === null ||
    facts.projectedAvailableCents === null ||
    facts.projectedClosingBalanceCents === null ||
    facts.projectionHorizonEnd === null
  )
    throw new AIInsightsFunctionError('insufficient_planning_context')
  return input
}

export function parseAIAnalysisRequest(value: unknown): AIAnalysisInput {
  if (isRecord(value) && isRecord(value.facts))
    guardCategoryLimit(value.facts, 'categoryBreakdown')
  return parseRequest(AIAnalysisRequestSchema, value)
}

export function parseExplainChangesRequest(value: unknown) {
  guardCategoryLimit(value, 'changes')
  return parseRequest(ExplainChangesRequestSchema, value)
}

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AIInsightsFunctionError('invalid_request')
  return parsed.data
}

function guardCategoryLimit(value: unknown, field: string): void {
  if (
    isRecord(value) &&
    Array.isArray(value[field]) &&
    value[field].length > AI_LIMITS.categories
  )
    throw new AIInsightsFunctionError('too_many_categories')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
