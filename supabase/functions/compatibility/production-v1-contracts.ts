import { z } from 'zod'

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
const uniqueCategoryIds = <T extends { categoryId: string }>(items: T[]) =>
  new Set(items.map(({ categoryId }) => categoryId)).size === items.length

const productionV1CategorySchema = z
  .object({
    categoryId: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(100),
    total: amountCentsSchema,
    percentage: z.number().finite(),
  })
  .strict()

const productionV1TopExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amount: amountCentsSchema,
  })
  .strict()

export const ProductionV1PeriodSummaryRequestSchema = z
  .object({
    aggregatedData: z
      .object({
        totalIncome: amountCentsSchema,
        totalExpenses: amountCentsSchema,
        categoryBreakdown: z
          .array(productionV1CategorySchema)
          .max(50)
          .refine(uniqueCategoryIds),
        topExpenses: z.array(productionV1TopExpenseSchema).max(20).optional(),
        periodType: z.enum(['monthly', 'biweekly']),
        startDate: dateOnlySchema,
        endDate: dateOnlySchema,
      })
      .strict()
      .refine(({ startDate, endDate }) => startDate <= endDate),
  })
  .strict()

export const ProductionV1PeriodSummaryResponseSchema = z
  .object({
    text: z.string().trim().min(1).max(1_000),
    highlights: z.array(z.string().trim().min(1).max(200)).max(5),
  })
  .strict()

export const PRODUCTION_FRONTEND_V1_MAX_RECEIPT_BYTES = 10 * 1024 * 1024
export const ProductionV1ReceiptRequestSchema = z
  .object({
    imageBase64: z
      .string()
      .min(1)
      .max(Math.ceil(PRODUCTION_FRONTEND_V1_MAX_RECEIPT_BYTES / 3) * 4),
    mimeType: z.enum(['image/jpeg', 'image/png']),
  })
  .strict()

export const ProductionV1ReceiptResponseSchema = z
  .object({
    merchant: z.string().trim().max(200).nullable(),
    date: dateOnlySchema.nullable(),
    total: amountCentsSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    confidence: z.number().finite().min(0).max(1),
    rawText: z.string().max(20_000).nullable(),
  })
  .strict()

export type ProductionV1PeriodSummaryRequest = z.infer<
  typeof ProductionV1PeriodSummaryRequestSchema
>
export type ProductionV1ReceiptRequest = z.infer<
  typeof ProductionV1ReceiptRequestSchema
>

export function parseProductionV1PeriodSummaryResponse(value: unknown) {
  return ProductionV1PeriodSummaryResponseSchema.parse(value)
}

export function parseProductionV1ReceiptResponse(value: unknown) {
  return ProductionV1ReceiptResponseSchema.parse(value)
}
