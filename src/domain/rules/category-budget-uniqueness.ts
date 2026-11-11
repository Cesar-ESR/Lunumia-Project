import type { CategoryBudget } from '../entities'

/** Fail closed: resolving existing duplicates requires a separate data decision. */
export function assertUniqueActiveCategoryBudgets(
  budgets: readonly CategoryBudget[],
): void {
  const keys = new Set<string>()
  for (const budget of budgets) {
    if (budget.deletedAt !== null) continue
    const key = JSON.stringify([
      budget.ownerId,
      budget.periodId,
      budget.categoryId,
    ])
    if (keys.has(key))
      throw new Error(
        'Hay presupuestos activos duplicados. Se requiere revisar los datos antes de continuar.',
      )
    keys.add(key)
  }
}
