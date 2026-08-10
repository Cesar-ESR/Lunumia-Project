import { isDateOnly } from '@domain/value-objects'
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
    total: amountCentsSchema,
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
    amount: amountCentsSchema,
  })
  .strict()

export const PeriodSummaryRequestSchema = z
  .object({
    aggregatedData: z
      .object({
        totalIncome: amountCentsSchema,
        totalExpenses: amountCentsSchema,
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
