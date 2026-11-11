import type { SyncOperation } from '@domain/entities'
import {
  buildPeriodOverlapPlan,
  planPeriodNavigation,
  validatePeriodResolutionChoices,
  type PeriodDependency,
} from '@application/services/PeriodOverlapResolution'
import {
  PERIOD_RESOLUTION_REQUIRED,
  ResolutionStaleError,
  type PeriodResolutionChoice,
  type PeriodResolutionPort,
  type PeriodResolutionPreview,
  type PeriodResolutionRemoteSnapshot,
} from '@application/services/PeriodResolutionPort'
import { GastoClaroDB } from '@infrastructure/local/database'

interface RemoteReader {
  readPeriodResolutionContext(
    operation: SyncOperation,
  ): Promise<PeriodResolutionRemoteSnapshot>
}

export class ApplyPeriodOverlapResolution implements PeriodResolutionPort {
  private previews = new Map<
    string,
    { preview: PeriodResolutionPreview; local: string; remote: string }
  >()
  constructor(
    private readonly db: GastoClaroDB,
    private readonly remote: RemoteReader,
    private readonly checkpoint: (stage: string) => void = () => undefined,
  ) {}

  private async snapshot(ownerId: string) {
    const [
      periods,
      expenses,
      incomes,
      occurrences,
      budgets,
      settings,
      operations,
      payments,
      categories,
    ] = await Promise.all([
      this.db.periods.where('ownerId').equals(ownerId).toArray(),
      this.db.expenses.where('ownerId').equals(ownerId).toArray(),
      this.db.incomes.where('ownerId').equals(ownerId).toArray(),
      this.db.recurringPaymentOccurrences
        .where('ownerId')
        .equals(ownerId)
        .toArray(),
      this.db.categoryBudgets.where('ownerId').equals(ownerId).toArray(),
      this.db.userSettings.where('ownerId').equals(ownerId).toArray(),
      this.db.syncOperations.where('ownerId').equals(ownerId).toArray(),
      this.db.recurringPayments.where('ownerId').equals(ownerId).toArray(),
      this.db.categories.where('ownerId').equals(ownerId).toArray(),
    ])
    return {
      periods,
      expenses,
      incomes,
      occurrences,
      budgets,
      settings,
      operations,
      payments,
      categories,
    }
  }

  async prepare(operation: SyncOperation): Promise<PeriodResolutionPreview> {
    const remote = await this.remote.readPeriodResolutionContext(operation)
    const local = await this.db.transaction('r', this.db.tables, () =>
      this.snapshot(operation.ownerId),
    )
    const current = local.operations.find(
      (row) => row.operationId === operation.operationId,
    )
    const period = local.periods.find((row) => row.id === operation.entityId)
    if (
      !current ||
      current.entityType !== 'period' ||
      current.operationType !== 'create' ||
      current.errorMessage !== PERIOD_RESOLUTION_REQUIRED ||
      !period ||
      local.settings.length !== 1
    )
      throw new ResolutionStaleError()
    if (
      local.operations.some(
        (row) =>
          row.entityId === period.id && row.operationId !== current.operationId,
      )
    )
      throw new Error(
        'El periodo tiene cambios posteriores que requieren revisión.',
      )
    const payload: unknown = JSON.parse(current.payload)
    if (
      !isObject(payload) ||
      payload.startDate !== period.startDate ||
      payload.endDate !== period.endDate ||
      payload.id !== period.id ||
      payload.ownerId !== period.ownerId
    )
      throw new ResolutionStaleError()
    const dependencies: PeriodDependency[] = [
      ...local.expenses
        .filter((row) => row.periodId === period.id)
        .map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          periodId: row.periodId,
          deletedAt: row.deletedAt,
          kind: 'expense' as const,
          date: row.date,
        })),
      ...local.incomes
        .filter((row) => row.periodId === period.id)
        .map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          periodId: row.periodId,
          deletedAt: row.deletedAt,
          kind: 'income' as const,
          date: row.date,
        })),
      ...local.occurrences
        .filter((row) => row.periodId === period.id)
        .map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          periodId: row.periodId,
          deletedAt: row.deletedAt,
          kind: 'recurringPaymentOccurrence' as const,
          date: row.dueDate,
        })),
      ...local.budgets
        .filter((row) => row.periodId === period.id)
        .map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          periodId: row.periodId,
          deletedAt: row.deletedAt,
          categoryId: row.categoryId,
          kind: 'categoryBudget' as const,
          date: null,
        })),
    ]
    const preview: PeriodResolutionPreview = {
      operationId: operation.operationId,
      revision: crypto.randomUUID(),
      plan: buildPeriodOverlapPlan(period, remote.periods, dependencies),
      navigation: planPeriodNavigation(
        local.settings[0]!,
        remote.settings,
        period.id,
        remote.periods,
      ),
      navigationPeriods: remote.periods,
      existingBudgets: [...local.budgets, ...remote.budgets].map(
        ({ id, ownerId, periodId, categoryId, deletedAt }) => ({
          id,
          ownerId,
          periodId,
          categoryId,
          deletedAt,
        }),
      ),
    }
    this.previews.set(operation.operationId, {
      preview,
      local: JSON.stringify(local),
      remote: JSON.stringify(remote),
    })
    return preview
  }

  async apply(
    ownerId: string,
    operationId: string,
    choice: PeriodResolutionChoice,
  ): Promise<void> {
    const saved = this.previews.get(operationId)
    if (
      !saved ||
      saved.preview.revision !== choice.revision ||
      saved.preview.plan.localPeriod.ownerId !== ownerId
    )
      throw new ResolutionStaleError()
    const operation = await this.db.syncOperations.get(operationId)
    if (!operation || operation.ownerId !== ownerId)
      throw new ResolutionStaleError()
    const remote = await this.remote.readPeriodResolutionContext(operation)
    if (JSON.stringify(remote) !== saved.remote)
      throw new ResolutionStaleError()
    await this.db.transaction('rw', this.db.tables, async () => {
      const local = await this.snapshot(ownerId)
      if (JSON.stringify(local) !== saved.local)
        throw new ResolutionStaleError()
      const { plan, navigation } = saved.preview
      const legacyId = plan.localPeriod.id
      const targets = validatePeriodResolutionChoices(
        plan,
        choice.destinations,
        [...local.budgets, ...remote.budgets],
      )
      for (const period of remote.periods) {
        const existing = local.periods.find((row) => row.id === period.id)
        if (
          existing &&
          (existing.syncStatus !== 'synced' ||
            existing.updatedAt !== period.updatedAt)
        )
          throw new ResolutionStaleError()
        await this.db.periods.put({ ...period, syncStatus: 'synced' })
      }
      const tables = {
        expense: this.db.expenses,
        income: this.db.incomes,
        recurringPaymentOccurrence: this.db.recurringPaymentOccurrences,
        categoryBudget: this.db.categoryBudgets,
      }
      const records = {
        expense: local.expenses,
        income: local.incomes,
        recurringPaymentOccurrence: local.occurrences,
        categoryBudget: local.budgets,
      }
      for (const { dependency } of plan.dependencies) {
        const record = records[dependency.kind].find(
          (row) => row.id === dependency.id,
        )
        if (!record) throw new ResolutionStaleError()
        const periodId = targets[`${dependency.kind}:${dependency.id}`]!
        const queued = local.operations.filter(
          (row) =>
            row.entityType === dependency.kind &&
            row.entityId === dependency.id,
        )
        if (!queued.length)
          throw new Error(
            'Una dependencia no tiene operación pendiente; requiere revisión.',
          )
        await tables[dependency.kind].update(record.id, { periodId })
        for (const queuedOperation of queued) {
          const body: unknown = JSON.parse(queuedOperation.payload)
          if (
            !isObject(body) ||
            body.id !== record.id ||
            body.ownerId !== ownerId ||
            body.periodId !== legacyId
          )
            throw new Error(
              'Una operación relacionada requiere revisión adicional.',
            )
          await this.db.syncOperations.put({
            ...queuedOperation,
            payload: JSON.stringify({ ...body, periodId }),
          })
        }
        if (dependency.kind === 'income') this.checkpoint('after-income')
      }
      const settings = local.settings[0]!
      let nextSettings =
        navigation.kind === 'REQUIRES_SELECTION'
          ? settings
          : navigation.settings
      if (navigation.kind === 'REQUIRES_SELECTION') {
        const selected = remote.periods.find(
          (period) => period.id === choice.selectedPeriodId,
        )
        if (!selected) throw new Error('Selecciona el periodo de navegación.')
        nextSettings = {
          ...settings,
          activePeriodId: selected.id,
          updatedAt: new Date(
            Math.max(
              Date.now(),
              Date.parse(settings.updatedAt) + 1,
              remote.settings ? Date.parse(remote.settings.updatedAt) + 1 : 0,
            ),
          ).toISOString(),
        }
      }
      if (nextSettings.activePeriodId === legacyId)
        throw new ResolutionStaleError()
      const settingsOperations = local.operations.filter(
        (row) => row.entityType === 'userSettings',
      )
      for (const queued of settingsOperations) {
        const body: unknown = JSON.parse(queued.payload)
        if (
          !isObject(body) ||
          body.currency !== settings.currency ||
          body.theme !== settings.theme ||
          body.updatedAt !== settings.updatedAt
        )
          throw new Error(
            'Las preferencias pendientes cambiaron; recalcula el conflicto.',
          )
      }
      await this.db.userSettings.delete(settings.id)
      await this.db.userSettings.put(nextSettings)
      if (navigation.kind === 'REMOTE_NEWER') {
        await this.db.syncOperations.bulkDelete(
          settingsOperations.map((row) => row.operationId),
        )
      } else {
        if (
          !settingsOperations.length &&
          JSON.stringify(settings) !== JSON.stringify(nextSettings)
        )
          throw new Error('Falta la operación de preferencias.')
        for (const queued of settingsOperations)
          await this.db.syncOperations.put({
            ...queued,
            entityId: nextSettings.id,
            payload: JSON.stringify(nextSettings),
          })
      }
      const after = await this.snapshot(ownerId)
      for (const rows of [
        after.expenses,
        after.incomes,
        after.occurrences,
        after.budgets,
        after.settings,
        after.payments,
      ]) {
        if (rows.some((row) => containsReference(row, legacyId)))
          throw new Error('Persisten referencias al periodo incompatible.')
      }
      for (const queued of after.operations) {
        if (queued.operationId === operationId) continue
        if (
          queued.entityId === legacyId ||
          containsReference(JSON.parse(queued.payload), legacyId)
        )
          throw new Error('Persisten referencias en la cola.')
      }
      this.checkpoint('before-period-delete')
      await this.db.syncOperations.delete(operationId)
      await this.db.periods.delete(legacyId)
    })
    this.previews.delete(operationId)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsReference(value: unknown, id: string): boolean {
  if (value === id) return true
  if (Array.isArray(value))
    return value.some((item) => containsReference(item, id))
  return (
    isObject(value) &&
    Object.values(value).some((item) => containsReference(item, id))
  )
}
