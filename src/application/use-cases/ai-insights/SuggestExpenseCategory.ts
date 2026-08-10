import type { Category } from '@domain/entities'
import type { AIInsightsProvider, CategorySuggestion } from '@domain/ports'

export class SuggestExpenseCategory {
  constructor(private readonly provider: AIInsightsProvider) {}

  async execute(
    description: string,
    categories: readonly Category[],
    ownerId: string,
  ): Promise<CategorySuggestion | null> {
    const available = categories
      .filter(
        (category) =>
          category.ownerId === ownerId && category.deletedAt === null,
      )
      .map(({ id, name }) => ({ id, name }))
    if (!description.trim() || available.length === 0) return null
    const suggestion = await this.provider.suggestCategory(
      description,
      available,
    )
    return suggestion &&
      available.some(({ id }) => id === suggestion.categoryId)
      ? suggestion
      : null
  }
}
