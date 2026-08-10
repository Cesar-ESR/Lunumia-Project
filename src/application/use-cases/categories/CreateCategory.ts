import { createCategorySchema } from '@application/contracts'
import { CategoryDuplicateError } from '@domain/errors'
import { normalizeCategoryName } from '@domain/rules'
import type { ICategoryRepository } from '@domain/repositories'
import type { Clock, IdGenerator } from '@application/services/IdGenerator'
export class CreateCategory {
  constructor(
    private readonly categories: ICategoryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: unknown) {
    const value = createCategorySchema.parse(input)
    const normalizedName = normalizeCategoryName(value.name)
    if (await this.categories.findByNormalizedName(normalizedName))
      throw new CategoryDuplicateError(value.name)
    const now = this.clock.now()
    return this.categories.create({
      id: this.ids.generate(),
      ...value,
      normalizedName,
      icon: value.icon ?? null,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    })
  }
}
