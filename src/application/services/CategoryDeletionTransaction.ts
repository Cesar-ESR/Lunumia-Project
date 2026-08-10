export interface CategoryDeletionTransaction {
  reassignAndDelete(
    categoryId: string,
    replacementCategoryId: string,
  ): Promise<void>
}
