import { z } from 'zod'

export const idSchema = z.string().uuid()
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const positiveCentsSchema = z.number().int().finite().positive()
export const nonNegativeCentsSchema = z.number().int().finite().nonnegative()
export const signedCentsSchema = z.number().int().finite().safe()
