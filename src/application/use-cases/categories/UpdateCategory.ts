import { createCategorySchema } from '@application/contracts'
import {
  CategoryDuplicateError,
  SystemCategoryProtectedError,
} from '@domain/errors'
import { normalizeCategoryName } from '@domain/rules'
import type { ICategoryRepository } from '@domain/repositories'
import type { Clock } from '@application/services/IdGenerator'
export class UpdateCategory {
  constructor(
    private readonly categories: ICategoryRepository,
    private readonly clock: Clock,
  ) {}
  async execute(id: string, input: unknown) {
    const current = await this.categories.findById(id)
    if (!current) throw new Error('La categoría no existe.')
    if (current.isSystem) throw new SystemCategoryProtectedError()
    const value = createCategorySchema.parse(input)
    const normalizedName = normalizeCategoryName(value.name)
    const duplicate = await this.categories.findByNormalizedName(normalizedName)
    if (duplicate && duplicate.id !== id)
      throw new CategoryDuplicateError(value.name)
    return this.categories.update({
      ...current,
      ...value,
      normalizedName,
      icon: value.icon ?? null,
      updatedAt: this.clock.now(),
      syncStatus: 'pending',
    })
  }
}
