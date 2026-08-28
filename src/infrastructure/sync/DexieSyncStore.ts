import type {
  LocalSyncStore,
  RemoteApplySummary,
  RemoteDefaultSnapshot,
  RemoteEntityChange,
  RemoteMutationResult,
  SynchronizableRecord,
} from '@application/services/SyncCoordinator'
import type {
  Category,
  CategoryBudget,
  DeviceSyncState,
  Expense,
  Income,
  Period,
  RecurringPayment,
  RecurringPaymentOccurrence,
  SyncCursor,
  SyncEntityType,
  SyncOperation,
  UserSettings,
} from '@domain/entities'
import { resolveLastWriteWins } from '@domain/rules'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  createSyncOperation,
  resolveSyncDependencies,
  type SyncMutationDependencies,
} from '@infrastructure/local/sync-mutations'

const uploadableStatuses = new Set<SyncOperation['status']>([
  'pending',
  'processing',
  'error',
])

export class DexieSyncStore implements LocalSyncStore {
  private readonly sync: SyncMutationDependencies

  constructor(
    private readonly db: GastoClaroDB,
    dependencies?: Partial<SyncMutationDependencies>,
    private readonly onReconciliationStep: (step: string) => void = () =>
      undefined,
  ) {
    this.sync = resolveSyncDependencies(dependencies)
  }

  async findUploadable(ownerId: string): Promise<SyncOperation[]> {
    const operations = await this.db.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .toArray()
    return sortOperationsByDependencies(
      operations.filter((operation) =>
        uploadableStatuses.has(operation.status),
      ),
    )
  }

  async markProcessing(operation: SyncOperation): Promise<void> {
    const current = await this.ownedOperation(operation)
    await this.db.syncOperations.put({
      ...current,
      status: 'processing',
      errorMessage: null,
    })
  }

  async markUploadError(
    operation: SyncOperation,
    message: string,
  ): Promise<void> {
    const current = await this.ownedOperation(operation)
    await this.db.syncOperations.put({
      ...current,
      status: 'error',
      errorMessage: message,
      retryCount: current.retryCount + 1,
    })
  }

  async completeUpload(
    operation: SyncOperation,
    result: RemoteMutationResult,
  ): Promise<void> {
    await this.db.transaction('rw', this.allMutableTables(), async () => {
      const current = await this.ownedOperation(operation)
      await this.db.syncOperations.delete(current.operationId)

      if (
        !(await this.hasQueuedMutation(
          operation.ownerId,
          operation.entityType,
          operation.entityId,
        ))
      ) {
        await this.markEntitySynced(
          operation.entityType,
          operation.entityId,
          operation.ownerId,
          result.entityUpdatedAt,
        )
      }

      if (operation.operationType === 'pay_recurring_occurrence') {
        const expenseId =
          result.relatedEntityId ?? readCompoundExpenseId(operation.payload)
        if (
          expenseId &&
          !(await this.hasQueuedMutation(
            operation.ownerId,
            'expense',
            expenseId,
          ))
        ) {
          await this.markEntitySynced(
            'expense',
            expenseId,
            operation.ownerId,
            result.relatedUpdatedAt,
          )
        }
      }
    })
  }

  async countUploadable(ownerId: string): Promise<number> {
    return (
      await this.db.syncOperations.where('ownerId').equals(ownerId).toArray()
    ).filter((operation) => uploadableStatuses.has(operation.status)).length
  }

  async reconcileRemoteDefaults(
    ownerId: string,
    snapshot: RemoteDefaultSnapshot,
    reconciledAt: string,
  ): Promise<void> {
    await this.db.transaction('rw', this.allMutableTables(), async () => {
      const [periodCountBefore, expenseCountBefore] = await Promise.all([
        this.db.periods.where('ownerId').equals(ownerId).count(),
        this.db.expenses.where('ownerId').equals(ownerId).count(),
      ])

      for (const remoteCategory of [...snapshot.categories].sort(
        compareRecords,
      )) {
        if (remoteCategory.ownerId !== ownerId)
          throw new Error(
            'La categorÃ­a predeterminada remota pertenece a otro usuario.',
          )
        const duplicates = (
          await this.db.categories
            .where('[ownerId+normalizedName]')
            .equals([ownerId, remoteCategory.normalizedName])
            .toArray()
        )
          .filter((category) => category.id !== remoteCategory.id)
          .sort(compareRecords)

        let canonicalCategory: Category = {
          ...remoteCategory,
          syncStatus: 'synced',
        }
        let categoryOperationType: 'update' | 'delete' | null = null
        for (const duplicate of duplicates) {
          await this.reconcileCategoryReferences(
            ownerId,
            duplicate,
            remoteCategory,
            reconciledAt,
          )
        }
        const localSource = duplicates.at(-1)
        if (localSource && !remoteCategory.isSystem) {
          const reconciledUpdatedAt = strictlyAfterRemote(
            reconciledAt,
            remoteCategory.updatedAt,
          )
          if (localSource.deletedAt !== null) {
            canonicalCategory = {
              ...remoteCategory,
              name: localSource.name,
              normalizedName: localSource.normalizedName,
              color: localSource.color,
              icon: localSource.icon,
              isSystem: false,
              updatedAt: reconciledUpdatedAt,
              deletedAt: reconciledUpdatedAt,
              syncStatus: 'pending',
            }
            categoryOperationType = 'delete'
          } else {
            const differsRemotely =
              localSource.name !== remoteCategory.name ||
              localSource.normalizedName !== remoteCategory.normalizedName ||
              localSource.color !== remoteCategory.color ||
              localSource.icon !== remoteCategory.icon
            if (differsRemotely) {
              canonicalCategory = {
                ...remoteCategory,
                name: localSource.name,
                normalizedName: localSource.normalizedName,
                color: localSource.color,
                icon: localSource.icon,
                isSystem: false,
                updatedAt: reconciledUpdatedAt,
                syncStatus: 'pending',
              }
              categoryOperationType = 'update'
            }
          }
        }
        if (duplicates.length > 0) {
          await this.removeQueuedEntityOperations(
            ownerId,
            'category',
            remoteCategory.id,
          )
          await this.db.categories.put(canonicalCategory)
          if (categoryOperationType) {
            await this.db.syncOperations.add(
              createSyncOperation(
                this.sync,
                ownerId,
                'category',
                canonicalCategory.id,
                categoryOperationType,
                canonicalCategory,
                reconciledAt,
              ),
            )
          }
        }
      }

      if (snapshot.userSettings) {
        if (snapshot.userSettings.ownerId !== ownerId)
          throw new Error('La configuraciÃ³n remota pertenece a otro usuario.')
        await this.reconcileUserSettings(
          ownerId,
          snapshot.userSettings,
          reconciledAt,
        )
      }

      const [periodCountAfter, expenseCountAfter] = await Promise.all([
        this.db.periods.where('ownerId').equals(ownerId).count(),
        this.db.expenses.where('ownerId').equals(ownerId).count(),
      ])
      if (
        periodCountAfter !== periodCountBefore ||
        expenseCountAfter !== expenseCountBefore
      ) {
        throw new Error(
          'La reconciliación de defaults no puede crear ni eliminar periodos o gastos.',
        )
      }
    })
  }

  async reconcileEquivalentPeriod(
    operation: SyncOperation,
    canonical: Period,
    reconciledAt: string,
  ): Promise<void> {
    await this.db.transaction('rw', this.allMutableTables(), async () => {
      const currentOperation = await this.ownedOperation(operation)
      if (
        currentOperation.entityType !== 'period' ||
        currentOperation.operationType !== 'create'
      ) {
        throw new Error(
          'Solo una creación de periodo pendiente puede reconciliarse.',
        )
      }

      const localAlias = await this.db.periods.get(currentOperation.entityId)
      if (
        !localAlias ||
        localAlias.ownerId !== currentOperation.ownerId ||
        localAlias.deletedAt !== null
      ) {
        throw new Error(
          'El periodo local en conflicto ya no existe, está eliminado o pertenece a otro usuario.',
        )
      }
      if (
        canonical.id === localAlias.id ||
        canonical.ownerId !== localAlias.ownerId ||
        canonical.deletedAt !== null ||
        canonical.type !== localAlias.type ||
        canonical.startDate !== localAlias.startDate ||
        canonical.endDate !== localAlias.endDate
      ) {
        throw new Error(
          'El periodo remoto no es un equivalente exacto y activo del periodo local.',
        )
      }
      const canonicalCollision = await this.db.periods.get(canonical.id)
      if (
        canonicalCollision &&
        canonicalCollision.ownerId !== currentOperation.ownerId
      ) {
        throw new Error(
          'El periodo remoto colisiona con un periodo local de otro usuario.',
        )
      }

      this.onReconciliationStep(`period:${localAlias.id}`)
      await this.rewriteQueuedPeriodReferences(
        currentOperation.ownerId,
        localAlias.id,
        canonical.id,
      )

      const incomes = await this.db.incomes
        .where('[ownerId+periodId]')
        .equals([currentOperation.ownerId, localAlias.id])
        .toArray()
      for (const income of incomes) {
        const rewritten: Income = {
          ...income,
          periodId: canonical.id,
          updatedAt: strictlyAfterRemote(reconciledAt, income.updatedAt),
          syncStatus: 'pending',
        }
        await this.db.incomes.put(rewritten)
        await this.rewriteOrEnqueuePeriodDependent(
          'income',
          rewritten,
          reconciledAt,
        )
      }

      const expenses = await this.db.expenses
        .where('[ownerId+periodId]')
        .equals([currentOperation.ownerId, localAlias.id])
        .toArray()
      for (const expense of expenses) {
        const rewritten: Expense = {
          ...expense,
          periodId: canonical.id,
          updatedAt: strictlyAfterRemote(reconciledAt, expense.updatedAt),
          syncStatus: 'pending',
        }
        await this.db.expenses.put(rewritten)
        await this.rewriteOrEnqueuePeriodDependent(
          'expense',
          rewritten,
          reconciledAt,
        )
      }

      const budgets = (
        await this.db.categoryBudgets
          .where('periodId')
          .equals(localAlias.id)
          .toArray()
      ).filter((budget) => budget.ownerId === currentOperation.ownerId)
      for (const budget of budgets) {
        const rewritten: CategoryBudget = {
          ...budget,
          periodId: canonical.id,
          updatedAt: strictlyAfterRemote(reconciledAt, budget.updatedAt),
          syncStatus: 'pending',
        }
        await this.db.categoryBudgets.put(rewritten)
        await this.rewriteOrEnqueuePeriodDependent(
          'categoryBudget',
          rewritten,
          reconciledAt,
        )
      }

      const occurrences = await this.db.recurringPaymentOccurrences
        .where('[ownerId+periodId]')
        .equals([currentOperation.ownerId, localAlias.id])
        .toArray()
      for (const occurrence of occurrences) {
        const rewritten: RecurringPaymentOccurrence = {
          ...occurrence,
          periodId: canonical.id,
          updatedAt: strictlyAfterRemote(reconciledAt, occurrence.updatedAt),
          syncStatus: 'pending',
        }
        await this.db.recurringPaymentOccurrences.put(rewritten)
        await this.rewriteOrEnqueuePeriodDependent(
          'recurringPaymentOccurrence',
          rewritten,
          reconciledAt,
        )
      }

      const settings = await this.db.userSettings
        .where('ownerId')
        .equals(currentOperation.ownerId)
        .and((value) => value.activePeriodId === localAlias.id)
        .toArray()
      for (const value of settings) {
        const rewritten: UserSettings = {
          ...value,
          activePeriodId: canonical.id,
          updatedAt: strictlyAfterRemote(reconciledAt, value.updatedAt),
        }
        await this.db.userSettings.put(rewritten)
        await this.rewriteOrEnqueuePeriodDependent(
          'userSettings',
          rewritten,
          reconciledAt,
        )
      }

      this.onReconciliationStep(`period:${localAlias.id}:references-rewritten`)
      await this.db.periods.put({ ...canonical, syncStatus: 'synced' })
      await this.removeQueuedEntityOperations(
        currentOperation.ownerId,
        'period',
        localAlias.id,
      )
      await this.db.periods.delete(localAlias.id)
    })
  }

  async getCursor(
    ownerId: string,
    entityType: SyncEntityType,
  ): Promise<SyncCursor> {
    const state = await this.db.deviceSyncStates
      .where('[ownerId+entityType]')
      .equals([ownerId, entityType])
      .first()
    return {
      lastUpdatedAt: state?.lastUpdatedAt ?? null,
      lastEntityId: state?.lastEntityId ?? null,
    }
  }

  async applyRemotePage(
    ownerId: string,
    entityType: SyncEntityType,
    changes: RemoteEntityChange[],
    cursor: SyncCursor,
  ): Promise<RemoteApplySummary> {
    return this.db.transaction('rw', this.allMutableTables(), async () => {
      const summary: RemoteApplySummary = {
        downloaded: 0,
        skipped: 0,
        conflicts: 0,
      }
      for (const change of changes) {
        if (
          change.entityType !== entityType ||
          change.record.ownerId !== ownerId
        ) {
          throw new Error(
            'La página remota contiene una entidad inesperada o de otro propietario.',
          )
        }
        const existing = await this.getEntity(entityType, change.record.id)
        if (existing && existing.ownerId !== ownerId) {
          throw new Error(
            'El UUID remoto colisiona con una entidad de otro propietario local.',
          )
        }

        const hasQueuedLocalMutation = existing
          ? await this.hasQueuedMutation(ownerId, entityType, change.record.id)
          : false
        if (hasQueuedLocalMutation) {
          summary.conflicts += 1
          summary.skipped += 1
          continue
        }

        const winner = existing
          ? resolveLastWriteWins(existing, change.record)
          : 'remote'
        const pendingConflict = existing ? hasPendingState(existing) : false
        if (pendingConflict && winner !== 'equal') summary.conflicts += 1

        if (winner === 'local') {
          summary.skipped += 1
          continue
        }

        await this.putRemoteEntity(change)
        summary.downloaded += 1
      }

      await this.upsertState(ownerId, entityType, cursor, null)
      return summary
    })
  }

  async markDownloadComplete(
    ownerId: string,
    entityType: SyncEntityType,
    completedAt: string,
  ): Promise<void> {
    await this.db.transaction('rw', this.db.deviceSyncStates, async () => {
      const cursor = await this.getCursor(ownerId, entityType)
      await this.upsertState(ownerId, entityType, cursor, completedAt)
    })
  }

  private async reconcileCategoryReferences(
    ownerId: string,
    localCategory: Category,
    remoteCategory: Category,
    reconciledAt: string,
  ): Promise<void> {
    this.onReconciliationStep(`category:${localCategory.id}`)
    const expenses = await this.db.expenses
      .where('[ownerId+categoryId]')
      .equals([ownerId, localCategory.id])
      .toArray()
    const budgets = (
      await this.db.categoryBudgets
        .where('categoryId')
        .equals(localCategory.id)
        .toArray()
    ).filter((budget) => budget.ownerId === ownerId)
    const payments = (
      await this.db.recurringPayments
        .where('categoryId')
        .equals(localCategory.id)
        .toArray()
    ).filter((payment) => payment.ownerId === ownerId)

    for (const expense of expenses) {
      const reconciled: Expense = {
        ...expense,
        categoryId: remoteCategory.id,
        updatedAt: reconciledAt,
        syncStatus: 'pending',
      }
      await this.db.expenses.put(reconciled)
      await this.rewriteOrEnqueueOperation('expense', reconciled, reconciledAt)
    }
    for (const budget of budgets) {
      const reconciled: CategoryBudget = {
        ...budget,
        categoryId: remoteCategory.id,
        updatedAt: reconciledAt,
        syncStatus: 'pending',
      }
      await this.db.categoryBudgets.put(reconciled)
      await this.rewriteOrEnqueueOperation(
        'categoryBudget',
        reconciled,
        reconciledAt,
      )
    }
    for (const payment of payments) {
      const reconciled: RecurringPayment = {
        ...payment,
        categoryId: remoteCategory.id,
        updatedAt: reconciledAt,
        syncStatus: 'pending',
      }
      await this.db.recurringPayments.put(reconciled)
      await this.rewriteOrEnqueueOperation(
        'recurringPayment',
        reconciled,
        reconciledAt,
      )
    }

    await this.rewriteCompoundExpenseReferences(
      ownerId,
      localCategory.id,
      remoteCategory.id,
      reconciledAt,
    )
    await this.removeQueuedEntityOperations(
      ownerId,
      'category',
      localCategory.id,
    )
    await this.db.categories.delete(localCategory.id)
  }

  private async reconcileUserSettings(
    ownerId: string,
    remote: UserSettings,
    reconciledAt: string,
  ): Promise<void> {
    const localSettings = (
      await this.db.userSettings.where('ownerId').equals(ownerId).toArray()
    ).sort(compareSettingsCandidates)
    if (localSettings.length === 0) return

    const candidatesWithValidPeriod: UserSettings[] = []
    for (const settings of localSettings) {
      if (!settings.activePeriodId) continue
      const period = await this.db.periods.get(settings.activePeriodId)
      if (period?.ownerId === ownerId && period.deletedAt === null)
        candidatesWithValidPeriod.push(settings)
    }
    const source =
      candidatesWithValidPeriod.sort(compareSettingsCandidates)[0] ??
      localSettings[0]
    if (!source) return

    const activePeriodId =
      candidatesWithValidPeriod[0]?.activePeriodId ?? remote.activePeriodId
    const differsRemotely =
      activePeriodId !== remote.activePeriodId ||
      source.currency !== remote.currency ||
      source.theme !== remote.theme
    const updatedAt = differsRemotely
      ? strictlyAfterRemote(reconciledAt, remote.updatedAt)
      : remote.updatedAt
    const canonical: UserSettings = {
      id: remote.id,
      ownerId,
      activePeriodId,
      currency: source.currency,
      theme: source.theme,
      createdAt: remote.createdAt,
      updatedAt,
    }

    this.onReconciliationStep(`userSettings:${source.id}`)
    const queued = (
      await this.db.syncOperations.where('ownerId').equals(ownerId).toArray()
    )
      .filter((operation) => operation.entityType === 'userSettings')
      .sort(compareOperations)
    await this.db.syncOperations.bulkDelete(
      queued.map((operation) => operation.operationId),
    )
    await this.db.userSettings
      .where('ownerId')
      .equals(ownerId)
      .and((settings) => settings.id !== remote.id)
      .delete()
    await this.db.userSettings.put(canonical)

    if (!differsRemotely) return
    const reusable = queued[0]
    await this.db.syncOperations.add(
      reusable
        ? {
            ...reusable,
            entityId: canonical.id,
            operationType: 'update',
            payload: JSON.stringify(canonical),
          }
        : createSyncOperation(
            this.sync,
            ownerId,
            'userSettings',
            canonical.id,
            'update',
            canonical,
            reconciledAt,
          ),
    )
  }

  private async rewriteQueuedPeriodReferences(
    ownerId: string,
    previousPeriodId: string,
    canonicalPeriodId: string,
  ): Promise<void> {
    const operations = await this.db.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .toArray()
    const rewritten: SyncOperation[] = []
    for (const operation of operations) {
      const payload = parseObject(operation.payload)
      if (!payload) continue
      let nextPayload: Record<string, unknown> | null = null

      if (operation.operationType === 'pay_recurring_occurrence') {
        const occurrence = isRecord(payload.occurrence)
          ? payload.occurrence
          : null
        const expense = isRecord(payload.expense) ? payload.expense : null
        const nextOccurrence =
          occurrence?.periodId === previousPeriodId
            ? { ...occurrence, periodId: canonicalPeriodId }
            : occurrence
        const nextExpense =
          expense?.periodId === previousPeriodId
            ? { ...expense, periodId: canonicalPeriodId }
            : expense
        if (nextOccurrence !== occurrence || nextExpense !== expense) {
          nextPayload = {
            ...payload,
            ...(nextOccurrence ? { occurrence: nextOccurrence } : {}),
            ...(nextExpense ? { expense: nextExpense } : {}),
          }
        }
      } else if (
        (operation.entityType === 'income' ||
          operation.entityType === 'expense' ||
          operation.entityType === 'categoryBudget' ||
          operation.entityType === 'recurringPaymentOccurrence') &&
        payload.periodId === previousPeriodId
      ) {
        nextPayload = { ...payload, periodId: canonicalPeriodId }
      } else if (
        operation.entityType === 'userSettings' &&
        payload.activePeriodId === previousPeriodId
      ) {
        nextPayload = { ...payload, activePeriodId: canonicalPeriodId }
      }

      if (nextPayload) {
        rewritten.push({
          ...operation,
          payload: JSON.stringify(nextPayload),
        })
      }
    }
    if (rewritten.length > 0) await this.db.syncOperations.bulkPut(rewritten)
  }

  private async rewriteOrEnqueuePeriodDependent(
    entityType:
      | 'income'
      | 'expense'
      | 'categoryBudget'
      | 'recurringPaymentOccurrence'
      | 'userSettings',
    record:
      | Income
      | Expense
      | CategoryBudget
      | RecurringPaymentOccurrence
      | UserSettings,
    reconciledAt: string,
  ): Promise<void> {
    const operations = await this.db.syncOperations
      .where('ownerId')
      .equals(record.ownerId)
      .toArray()
    const rewritten: SyncOperation[] = []
    let covered = false
    for (const operation of operations) {
      if (
        operation.operationType !== 'pay_recurring_occurrence' &&
        operation.entityType === entityType &&
        operation.entityId === record.id
      ) {
        covered = true
        rewritten.push({ ...operation, payload: JSON.stringify(record) })
        continue
      }
      if (
        operation.operationType !== 'pay_recurring_occurrence' ||
        (entityType !== 'expense' &&
          entityType !== 'recurringPaymentOccurrence')
      ) {
        continue
      }
      const payload = parseObject(operation.payload)
      if (!payload) continue
      const payloadKey = entityType === 'expense' ? 'expense' : 'occurrence'
      const nested = isRecord(payload[payloadKey]) ? payload[payloadKey] : null
      if (nested?.id !== record.id) continue
      covered = true
      rewritten.push({
        ...operation,
        payload: JSON.stringify({ ...payload, [payloadKey]: record }),
      })
    }
    if (rewritten.length > 0) await this.db.syncOperations.bulkPut(rewritten)
    if (!covered) {
      await this.db.syncOperations.add(
        createSyncOperation(
          this.sync,
          record.ownerId,
          entityType,
          record.id,
          'update',
          record,
          reconciledAt,
        ),
      )
    }
  }

  private async rewriteOrEnqueueOperation(
    entityType: 'expense' | 'categoryBudget' | 'recurringPayment',
    record: Expense | CategoryBudget | RecurringPayment,
    reconciledAt: string,
  ): Promise<void> {
    const operations = (
      await this.db.syncOperations
        .where('ownerId')
        .equals(record.ownerId)
        .toArray()
    ).filter(
      (operation) =>
        operation.entityType === entityType &&
        operation.entityId === record.id &&
        operation.operationType !== 'pay_recurring_occurrence',
    )
    if (operations.length === 0) {
      await this.db.syncOperations.add(
        createSyncOperation(
          this.sync,
          record.ownerId,
          entityType,
          record.id,
          'update',
          record,
          reconciledAt,
        ),
      )
      return
    }
    await this.db.syncOperations.bulkPut(
      operations.map((operation) => ({
        ...operation,
        payload: JSON.stringify(record),
      })),
    )
  }

  private async rewriteCompoundExpenseReferences(
    ownerId: string,
    previousCategoryId: string,
    canonicalCategoryId: string,
    reconciledAt: string,
  ): Promise<void> {
    const operations = await this.db.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .toArray()
    const rewritten: SyncOperation[] = []
    for (const operation of operations) {
      if (operation.operationType !== 'pay_recurring_occurrence') continue
      const payload = parseObject(operation.payload)
      const expense = isRecord(payload?.expense) ? payload.expense : null
      if (expense?.categoryId !== previousCategoryId) continue
      rewritten.push({
        ...operation,
        payload: JSON.stringify({
          ...payload,
          expense: {
            ...expense,
            categoryId: canonicalCategoryId,
            updatedAt: reconciledAt,
            syncStatus: 'pending',
          },
        }),
      })
    }
    if (rewritten.length > 0) await this.db.syncOperations.bulkPut(rewritten)
  }

  private async removeQueuedEntityOperations(
    ownerId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<void> {
    const operationIds = (
      await this.db.syncOperations.where('ownerId').equals(ownerId).toArray()
    )
      .filter(
        (operation) =>
          operation.entityType === entityType &&
          operation.entityId === entityId,
      )
      .map((operation) => operation.operationId)
    if (operationIds.length > 0)
      await this.db.syncOperations.bulkDelete(operationIds)
  }

  private async ownedOperation(
    operation: SyncOperation,
  ): Promise<SyncOperation> {
    const current = await this.db.syncOperations.get(operation.operationId)
    if (!current || current.ownerId !== operation.ownerId) {
      throw new Error(
        `La operación ${operation.operationId} ya no existe o pertenece a otro usuario.`,
      )
    }
    return current
  }

  private async hasQueuedMutation(
    ownerId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<boolean> {
    const operations = await this.db.syncOperations
      .where('ownerId')
      .equals(ownerId)
      .toArray()
    return operations.some(
      (operation) =>
        operation.entityType === entityType && operation.entityId === entityId,
    )
  }

  private async markEntitySynced(
    entityType: SyncEntityType,
    entityId: string,
    ownerId: string,
    updatedAt: string | null,
  ): Promise<void> {
    switch (entityType) {
      case 'period':
        return this.markSyncable(this.db.periods, entityId, ownerId, updatedAt)
      case 'income':
        return this.markSyncable(this.db.incomes, entityId, ownerId, updatedAt)
      case 'expense':
        return this.markSyncable(this.db.expenses, entityId, ownerId, updatedAt)
      case 'category':
        return this.markSyncable(
          this.db.categories,
          entityId,
          ownerId,
          updatedAt,
        )
      case 'categoryBudget':
        return this.markSyncable(
          this.db.categoryBudgets,
          entityId,
          ownerId,
          updatedAt,
        )
      case 'recurringPayment':
        return this.markSyncable(
          this.db.recurringPayments,
          entityId,
          ownerId,
          updatedAt,
        )
      case 'recurringPaymentOccurrence':
        return this.markSyncable(
          this.db.recurringPaymentOccurrences,
          entityId,
          ownerId,
          updatedAt,
        )
      case 'balanceAnchor':
        return this.markSyncable(
          this.db.balanceAnchors,
          entityId,
          ownerId,
          updatedAt,
        )
      case 'userSettings': {
        const current = await this.db.userSettings.get(entityId)
        if (current?.ownerId === ownerId && updatedAt) {
          await this.db.userSettings.put({ ...current, updatedAt })
        }
      }
    }
  }

  private async markSyncable<
    T extends SynchronizableRecord & { syncStatus: string },
  >(
    table: {
      get(id: string): Promise<T | undefined>
      put(value: T): Promise<unknown>
    },
    entityId: string,
    ownerId: string,
    updatedAt: string | null,
  ): Promise<void> {
    const current = await table.get(entityId)
    if (current?.ownerId === ownerId) {
      await table.put({
        ...current,
        updatedAt: updatedAt ?? current.updatedAt,
        syncStatus: 'synced',
      })
    }
  }

  private async getEntity(
    entityType: SyncEntityType,
    id: string,
  ): Promise<SynchronizableRecord | undefined> {
    switch (entityType) {
      case 'period':
        return this.db.periods.get(id)
      case 'income':
        return this.db.incomes.get(id)
      case 'expense':
        return this.db.expenses.get(id)
      case 'category':
        return this.db.categories.get(id)
      case 'categoryBudget':
        return this.db.categoryBudgets.get(id)
      case 'recurringPayment':
        return this.db.recurringPayments.get(id)
      case 'recurringPaymentOccurrence':
        return this.db.recurringPaymentOccurrences.get(id)
      case 'balanceAnchor':
        return this.db.balanceAnchors.get(id)
      case 'userSettings':
        return this.db.userSettings.get(id)
    }
  }

  private async putRemoteEntity(change: RemoteEntityChange): Promise<void> {
    switch (change.entityType) {
      case 'period':
        await this.db.periods.put(change.record)
        return
      case 'income':
        await this.db.incomes.put(change.record)
        return
      case 'category':
        await this.db.categories.put(change.record)
        return
      case 'categoryBudget':
        await this.db.categoryBudgets.put(change.record)
        return
      case 'recurringPayment':
        await this.db.recurringPayments.put(change.record)
        return
      case 'userSettings':
        await this.db.userSettings.put(change.record)
        return
      case 'recurringPaymentOccurrence': {
        const existing = await this.db.recurringPaymentOccurrences.get(
          change.record.id,
        )
        const linkedExpense = await this.db.expenses
          .where('recurringOccurrenceId')
          .equals(change.record.id)
          .filter(
            (expense) =>
              expense.ownerId === change.record.ownerId &&
              expense.deletedAt === null,
          )
          .first()
        await this.db.recurringPaymentOccurrences.put({
          ...change.record,
          transactionId:
            change.record.status === 'paid'
              ? (linkedExpense?.id ?? existing?.transactionId ?? null)
              : null,
        })
        return
      }
      case 'balanceAnchor':
        await this.db.balanceAnchors.put(change.record)
        return
      case 'expense': {
        await this.db.expenses.put(change.record)
        if (change.record.recurringOccurrenceId) {
          const occurrence = await this.db.recurringPaymentOccurrences.get(
            change.record.recurringOccurrenceId,
          )
          if (occurrence?.ownerId === change.record.ownerId) {
            await this.db.recurringPaymentOccurrences.put({
              ...occurrence,
              transactionId:
                change.record.deletedAt === null ? change.record.id : null,
            })
          }
        }
      }
    }
  }

  private async upsertState(
    ownerId: string,
    entityType: SyncEntityType,
    cursor: SyncCursor,
    lastSuccessfulSyncAt: string | null,
  ): Promise<void> {
    const existing = await this.db.deviceSyncStates
      .where('[ownerId+entityType]')
      .equals([ownerId, entityType])
      .first()
    const monotonicCursor = maximumCursor(
      {
        lastUpdatedAt: existing?.lastUpdatedAt ?? null,
        lastEntityId: existing?.lastEntityId ?? null,
      },
      cursor,
    )
    const state: DeviceSyncState = {
      id: existing?.id ?? `${ownerId}:${entityType}`,
      ownerId,
      entityType,
      lastUpdatedAt: monotonicCursor.lastUpdatedAt,
      lastEntityId: monotonicCursor.lastEntityId,
      lastSuccessfulSyncAt:
        lastSuccessfulSyncAt ?? existing?.lastSuccessfulSyncAt ?? null,
    }
    await this.db.deviceSyncStates.put(state)
  }

  private allMutableTables() {
    return [
      this.db.periods,
      this.db.incomes,
      this.db.expenses,
      this.db.categories,
      this.db.categoryBudgets,
      this.db.recurringPayments,
      this.db.recurringPaymentOccurrences,
      this.db.balanceAnchors,
      this.db.userSettings,
      this.db.syncOperations,
      this.db.deviceSyncStates,
    ] as const
  }
}

function compareOperations(left: SyncOperation, right: SyncOperation): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.operationId.localeCompare(right.operationId)
  )
}

function sortOperationsByDependencies(
  operations: SyncOperation[],
): SyncOperation[] {
  const baseline = [...operations].sort(compareOperations)
  const operationsByEntity = new Map<string, SyncOperation[]>()
  for (const operation of baseline) {
    const key = entityKey(operation.entityType, operation.entityId)
    const values = operationsByEntity.get(key) ?? []
    values.push(operation)
    operationsByEntity.set(key, values)
  }

  const dependencies = new Map<string, Set<string>>()
  const dependents = new Map<string, Set<string>>()
  for (const operation of baseline) {
    const required = new Set<string>()
    for (const reference of operationReferences(operation)) {
      for (const parent of operationsByEntity.get(
        entityKey(reference.entityType, reference.entityId),
      ) ?? []) {
        if (parent.operationId !== operation.operationId)
          required.add(parent.operationId)
      }
    }
    dependencies.set(operation.operationId, required)
    for (const parentId of required) {
      const children = dependents.get(parentId) ?? new Set<string>()
      children.add(operation.operationId)
      dependents.set(parentId, children)
    }
  }

  const byId = new Map(
    baseline.map((operation) => [operation.operationId, operation]),
  )
  const ready = baseline.filter(
    (operation) => dependencies.get(operation.operationId)?.size === 0,
  )
  const sorted: SyncOperation[] = []
  const emitted = new Set<string>()
  while (ready.length > 0) {
    ready.sort(compareOperations)
    const operation = ready.shift()
    if (!operation || emitted.has(operation.operationId)) continue
    emitted.add(operation.operationId)
    sorted.push(operation)
    for (const childId of dependents.get(operation.operationId) ?? []) {
      const required = dependencies.get(childId)
      required?.delete(operation.operationId)
      if (required?.size === 0) {
        const child = byId.get(childId)
        if (child) ready.push(child)
      }
    }
  }

  sorted.push(
    ...baseline.filter((operation) => !emitted.has(operation.operationId)),
  )
  return sorted
}

interface EntityReference {
  entityType: SyncEntityType
  entityId: string
}

function operationReferences(operation: SyncOperation): EntityReference[] {
  const payload = parseObject(operation.payload)
  if (!payload) return []
  if (operation.operationType === 'pay_recurring_occurrence') {
    const occurrence = isRecord(payload.occurrence) ? payload.occurrence : null
    const expense = isRecord(payload.expense) ? payload.expense : null
    return compactReferences([
      reference('period', occurrence?.periodId),
      reference('recurringPayment', occurrence?.recurringPaymentId),
      reference('period', expense?.periodId),
      reference('category', expense?.categoryId),
    ])
  }
  switch (operation.entityType) {
    case 'period':
    case 'category':
    case 'balanceAnchor':
      return []
    case 'income':
      return compactReferences([reference('period', payload.periodId)])
    case 'expense':
      return compactReferences([
        reference('period', payload.periodId),
        reference('category', payload.categoryId),
        reference('recurringPaymentOccurrence', payload.recurringOccurrenceId),
      ])
    case 'categoryBudget':
      return compactReferences([
        reference('period', payload.periodId),
        reference('category', payload.categoryId),
      ])
    case 'recurringPayment':
      return compactReferences([reference('category', payload.categoryId)])
    case 'recurringPaymentOccurrence':
      return compactReferences([
        reference('period', payload.periodId),
        reference('recurringPayment', payload.recurringPaymentId),
      ])
    case 'userSettings':
      return compactReferences([reference('period', payload.activePeriodId)])
  }
}

function reference(
  entityType: SyncEntityType,
  entityId: unknown,
): EntityReference | null {
  return typeof entityId === 'string' ? { entityType, entityId } : null
}

function compactReferences(
  references: Array<EntityReference | null>,
): EntityReference[] {
  return references.filter(
    (reference): reference is EntityReference => reference !== null,
  )
}

function entityKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

function compareRecords(
  left: { id: string; updatedAt: string },
  right: { id: string; updatedAt: string },
): number {
  return (
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.id.localeCompare(right.id)
  )
}

function compareSettingsCandidates(
  left: UserSettings,
  right: UserSettings,
): number {
  return (
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  )
}

function strictlyAfterRemote(candidate: string, remote: string): string {
  if (candidate > remote) return candidate
  return new Date(Date.parse(remote) + 1).toISOString()
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function hasPendingState(record: SynchronizableRecord): boolean {
  return 'syncStatus' in record && record.syncStatus !== 'synced'
}

function maximumCursor(current: SyncCursor, candidate: SyncCursor): SyncCursor {
  if (current.lastUpdatedAt === null) return candidate
  if (candidate.lastUpdatedAt === null) return current
  const timestamp = current.lastUpdatedAt.localeCompare(candidate.lastUpdatedAt)
  if (timestamp > 0) return current
  if (timestamp < 0) return candidate
  return (current.lastEntityId ?? '') >= (candidate.lastEntityId ?? '')
    ? current
    : candidate
}

function readCompoundExpenseId(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (!isRecord(parsed) || !isRecord(parsed.expense)) return null
    return typeof parsed.expense.id === 'string' ? parsed.expense.id : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
