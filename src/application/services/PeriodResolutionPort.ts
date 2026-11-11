import type { Period, SyncOperation, UserSettings } from '@domain/entities'
import type {
  ExistingBudgetReference,
  PeriodNavigationDecision,
  PeriodOverlapPlan,
} from './PeriodOverlapResolution'

export const PERIOD_RESOLUTION_REQUIRED = 'PERIOD_OVERLAP_REQUIRES_RESOLUTION'

export interface PeriodResolutionRemoteSnapshot {
  periods: Period[]
  settings: UserSettings | null
  budgets: ExistingBudgetReference[]
}

export interface PeriodResolutionPreview {
  operationId: string
  revision: string
  plan: PeriodOverlapPlan
  navigation: PeriodNavigationDecision
  navigationPeriods: Period[]
  existingBudgets: ExistingBudgetReference[]
}

export interface PeriodResolutionChoice {
  revision: string
  destinations: Record<string, string>
  selectedPeriodId?: string
}

export interface PeriodResolutionPort {
  prepare(operation: SyncOperation): Promise<PeriodResolutionPreview>
  apply(
    ownerId: string,
    operationId: string,
    choice: PeriodResolutionChoice,
  ): Promise<void>
}

export class ResolutionStaleError extends Error {
  constructor() {
    super(
      'El conflicto cambió. Vuelve a abrirlo para recalcular la resolución.',
    )
    this.name = 'ResolutionStaleError'
  }
}
