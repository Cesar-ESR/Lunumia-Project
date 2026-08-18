import { isDateOnly } from '@domain/value-objects'
import type { FinancialSnapshot } from '@domain/calculations'
import type { PeriodAggregatedData } from '@domain/ports'
import { z } from 'zod'

export const AI_REQUEST_LIMITS = {
  description: 2_000,
  categories: 50,
  categoryName: 100,
  topExpenses: 20,
  topExpenseDescription: 200,
} as const

const dateOnlySchema = z.string().refine(isDateOnly, 'Fecha DateOnly inválida.')
const amountCentsSchema = z.number().int().finite().nonnegative()
const signedCentsSchema = z.number().int().finite().safe()
const uniqueIds = <T extends { categoryId: string }>(items: T[]) =>
  new Set(items.map(({ categoryId }) => categoryId)).size === items.length

export const AvailableCategorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(AI_REQUEST_LIMITS.categoryName),
  })
  .strict()

export const SuggestCategoryRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(AI_REQUEST_LIMITS.description),
    categories: z
      .array(AvailableCategorySchema)
      .max(AI_REQUEST_LIMITS.categories),
  })
  .strict()
  .refine(
    ({ categories }) =>
      new Set(categories.map(({ id }) => id)).size === categories.length,
    { path: ['categories'], message: 'Los IDs de categoría deben ser únicos.' },
  )

const PeriodCategoryBreakdownSchema = z
  .object({
    categoryId: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(AI_REQUEST_LIMITS.categoryName),
    totalCents: amountCentsSchema,
    percentage: z.number().finite(),
  })
  .strict()

const PeriodTopExpenseSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1)
      .max(AI_REQUEST_LIMITS.topExpenseDescription),
    amountCents: amountCentsSchema,
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
          .array(PeriodCategoryBreakdownSchema)
          .max(AI_REQUEST_LIMITS.categories)
          .refine(uniqueIds, 'Los IDs de categoría deben ser únicos.'),
        topExpenses: z
          .array(PeriodTopExpenseSchema)
          .max(AI_REQUEST_LIMITS.topExpenses)
          .optional(),
        periodType: z.enum(['monthly', 'biweekly']),
        startDate: dateOnlySchema,
        endDate: dateOnlySchema,
      })
      .strict()
      .refine(({ startDate, endDate }) => startDate <= endDate, {
        path: ['endDate'],
        message: 'La fecha final debe ser posterior a la inicial.',
      }),
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

export type HistoricalAnalysisRequest = z.infer<
  typeof HistoricalAnalysisRequestSchema
>
export type PlanningAnalysisRequest = z.infer<
  typeof PlanningAnalysisRequestSchema
>
export type AIAnalysisRequest = z.infer<typeof AIAnalysisRequestSchema>

export function buildHistoricalAnalysisRequest(
  aggregatedData: PeriodAggregatedData,
): HistoricalAnalysisRequest {
  return HistoricalAnalysisRequestSchema.parse({
    context: 'historical',
    facts: {
      receivedIncomeCents: aggregatedData.totalIncome,
      expenseCents: aggregatedData.totalExpenses,
      categoryBreakdown: aggregatedData.categoryBreakdown.map((category) => ({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        totalCents: category.total,
        percentage: category.percentage,
      })),
      topExpenses: aggregatedData.topExpenses?.map((expense) => ({
        description: expense.description,
        amountCents: expense.amount,
      })),
      periodType: aggregatedData.periodType,
      startDate: aggregatedData.startDate,
      endDate: aggregatedData.endDate,
    },
  })
}

export function buildPlanningAnalysisRequest(
  snapshot: FinancialSnapshot,
): PlanningAnalysisRequest {
  return PlanningAnalysisRequestSchema.parse({
    context: 'planning',
    facts: {
      currentBalanceCents: snapshot.currentBalanceCents,
      committedCents: snapshot.committedCents,
      expectedIncomeCents: snapshot.expectedIncomeCents,
      projectedAvailableCents: snapshot.projectedAvailableCents,
      projectedClosingBalanceCents: snapshot.projectedClosingBalanceCents,
      projectionCoverage: snapshot.projectionCoverage,
      projectionHorizonEnd: snapshot.projectionHorizonEnd,
    },
  })
}

const CalculatedCategoryChangeSchema = z
  .object({
    categoryId: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(AI_REQUEST_LIMITS.categoryName),
    currentAmount: amountCentsSchema,
    previousAmount: amountCentsSchema,
    changePercentage: z.number().finite().nullable(),
    absoluteChange: z.number().int().finite(),
  })
  .strict()

export const ExplainChangesRequestSchema = z
  .object({
    changes: z
      .array(CalculatedCategoryChangeSchema)
      .max(AI_REQUEST_LIMITS.categories)
      .refine(uniqueIds, 'Los IDs de categoría deben ser únicos.'),
  })
  .strict()
