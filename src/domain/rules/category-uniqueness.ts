export const normalizeCategoryName = (name: string): string =>
  name.trim().toLowerCase()
export const areCategoryNamesEquivalent = (
  first: string,
  second: string,
): boolean => normalizeCategoryName(first) === normalizeCategoryName(second)
