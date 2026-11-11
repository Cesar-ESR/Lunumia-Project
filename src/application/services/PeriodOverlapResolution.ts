import type { Period, UserSettings } from '@domain/entities'

export type PeriodDependencyKind =
  'expense' | 'income' | 'recurringPaymentOccurrence' | 'categoryBudget'

/** Presentation metadata only: never include amounts or descriptions. */
export interface PeriodDependency {
  id: string
  kind: PeriodDependencyKind
  ownerId: string
  periodId: string
  date: string | null
  categoryId?: string
  deletedAt: string | null
}

export interface PeriodDependencyResolution {
  dependency: PeriodDependency
  classification: 'DATE_RESOLVABLE' | 'AMBIGUOUS' | 'UNRESOLVED'
  targetPeriodId: string | null
  candidatePeriodIds: string[]
}

export interface PeriodOverlapPlan {
  classification: 'EXACT_EQUIVALENT' | 'TRUE_OVERLAP'
  localPeriod: Period
  remotePeriods: Period[]
  dependencies: PeriodDependencyResolution[]
}

/** Both endpoints are inclusive, matching PeriodRepository and the SQL constraint. */
export function buildPeriodOverlapPlan(
  localPeriod: Period,
  remotePeriods: readonly Period[],
  dependencies: readonly PeriodDependency[],
): PeriodOverlapPlan {
  if (localPeriod.deletedAt !== null)
    throw new Error('El periodo local ya no está activo.')
  if (remotePeriods.some((period) => period.ownerId !== localPeriod.ownerId))
    throw new Error('Los periodos pertenecen a propietarios distintos.')
  if (remotePeriods.some((period) => period.id === localPeriod.id))
    throw new Error('El periodo local existe remotamente; requiere revisión.')

  const candidates = remotePeriods
    .filter(
      (period) =>
        period.deletedAt === null &&
        period.startDate <= localPeriod.endDate &&
        localPeriod.startDate <= period.endDate,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (candidates.length === 0)
    throw new Error('No hay periodos remotos solapados verificables.')
  for (let index = 1; index < candidates.length; index += 1) {
    if (candidates[index - 1]!.endDate >= candidates[index]!.startDate)
      throw new Error('Los candidatos remotos se solapan entre sí.')
  }

  const exact = candidates.find(
    (period) =>
      period.type === localPeriod.type &&
      period.startDate === localPeriod.startDate &&
      period.endDate === localPeriod.endDate,
  )
  const seen = new Set<string>()
  const resolutions = dependencies.map((dependency) => {
    if (
      dependency.ownerId !== localPeriod.ownerId ||
      dependency.periodId !== localPeriod.id
    )
      throw new Error('La dependencia no pertenece al periodo auditado.')
    const key = `${dependency.kind}:${dependency.id}`
    if (seen.has(key)) throw new Error('La dependencia está duplicada.')
    seen.add(key)

    if (dependency.kind === 'categoryBudget') {
      return {
        dependency,
        classification: 'AMBIGUOUS' as const,
        targetPeriodId: null,
        candidatePeriodIds: candidates.map((period) => period.id),
      }
    }
    const matches = candidates.filter(
      (period) =>
        dependency.date !== null &&
        period.startDate <= dependency.date &&
        dependency.date <= period.endDate,
    )
    return {
      dependency,
      classification:
        matches.length === 1
          ? ('DATE_RESOLVABLE' as const)
          : ('UNRESOLVED' as const),
      targetPeriodId: matches.length === 1 ? matches[0]!.id : null,
      candidatePeriodIds: matches.map((period) => period.id),
    }
  })
  return {
    classification: exact ? 'EXACT_EQUIVALENT' : 'TRUE_OVERLAP',
    localPeriod,
    remotePeriods: candidates,
    dependencies: resolutions,
  }
}

export interface ExistingBudgetReference {
  id: string
  ownerId: string
  periodId: string
  categoryId: string
  deletedAt: string | null
}

/** Run again inside the eventual write transaction, not only while previewing. */
export function validatePeriodResolutionChoices(
  plan: PeriodOverlapPlan,
  choices: Readonly<Record<string, string>>,
  existingBudgets: readonly ExistingBudgetReference[],
): Record<string, string> {
  const result: Record<string, string> = {}
  const usedBudgetKeys = new Set(
    existingBudgets
      .filter(
        (budget) =>
          budget.ownerId === plan.localPeriod.ownerId &&
          budget.deletedAt === null &&
          budget.periodId !== plan.localPeriod.id,
      )
      .map((budget) => `${budget.periodId}:${budget.categoryId}`),
  )
  for (const resolution of plan.dependencies) {
    const { dependency } = resolution
    const key = `${dependency.kind}:${dependency.id}`
    if (resolution.classification === 'UNRESOLVED')
      throw new Error('Una fecha no tiene un periodo de destino válido.')
    const target = resolution.targetPeriodId ?? choices[key]
    if (!target || !resolution.candidatePeriodIds.includes(target))
      throw new Error('Selecciona un periodo válido para cada presupuesto.')
    if (choices[key] && choices[key] !== target)
      throw new Error(
        'No se puede reemplazar un destino determinado por fecha.',
      )
    if (dependency.kind === 'categoryBudget' && dependency.deletedAt === null) {
      if (!dependency.categoryId)
        throw new Error('El presupuesto no tiene una categoría verificable.')
      const budgetKey = `${target}:${dependency.categoryId}`
      if (usedBudgetKeys.has(budgetKey))
        throw new Error('Ya existe un presupuesto activo en el destino.')
      usedBudgetKeys.add(budgetKey)
    }
    result[key] = target
  }
  for (const key of Object.keys(choices)) {
    if (!(key in result))
      throw new Error('La selección contiene una dependencia desconocida.')
  }
  return result
}

export type PeriodNavigationDecision =
  | { kind: 'PRESERVE_LOCAL'; settings: UserSettings }
  | { kind: 'REMOTE_NEWER'; settings: UserSettings }
  | {
      kind: 'REQUIRES_SELECTION'
      currency: string
      theme: UserSettings['theme']
    }

/** Never invent a newer timestamp or discard unrelated local preferences. */
export function planPeriodNavigation(
  local: UserSettings,
  remote: UserSettings | null,
  legacyPeriodId: string,
  availablePeriods: readonly Period[],
): PeriodNavigationDecision {
  if (remote && remote.ownerId !== local.ownerId)
    throw new Error('La configuración remota pertenece a otro propietario.')
  const valid = (id: string | null) =>
    id !== null &&
    id !== legacyPeriodId &&
    availablePeriods.some(
      (period) =>
        period.id === id &&
        period.ownerId === local.ownerId &&
        period.deletedAt === null,
    )
  if (
    remote &&
    Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) &&
    remote.currency === local.currency &&
    remote.theme === local.theme &&
    valid(remote.activePeriodId)
  )
    return { kind: 'REMOTE_NEWER', settings: remote }
  if (valid(local.activePeriodId))
    return { kind: 'PRESERVE_LOCAL', settings: local }
  return {
    kind: 'REQUIRES_SELECTION',
    currency: local.currency,
    theme: local.theme,
  }
}
