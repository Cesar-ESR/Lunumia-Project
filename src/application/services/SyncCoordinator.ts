import type {
  BalanceAnchor,
  Category,
  CategoryBudget,
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

export interface SynchronizableRecordByType {
  balanceAnchor: BalanceAnchor
  period: Period
  income: Income
  expense: Expense
  category: Category
  categoryBudget: CategoryBudget
  recurringPayment: RecurringPayment
  recurringPaymentOccurrence: RecurringPaymentOccurrence
  userSettings: UserSettings
}

export type SynchronizableRecord = SynchronizableRecordByType[SyncEntityType]

export type RemoteEntityChange = {
  [EntityType in SyncEntityType]: {
    entityType: EntityType
    record: SynchronizableRecordByType[EntityType]
  }
}[SyncEntityType]

export interface RemoteMutationResult {
  status: 'applied' | 'already_processed' | 'remote_wins'
  entityUpdatedAt: string | null
  relatedEntityId: string | null
  relatedUpdatedAt: string | null
}

export interface SyncError {
  stage: 'validation' | 'upload' | 'download'
  kind: SyncErrorKind
  code: string | null
  retryable: boolean
  message: string
  operationId?: string
  entityType?: SyncEntityType
}

export type SyncErrorKind =
  | 'network'
  | 'unauthenticated'
  | 'permission_denied'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'unknown'

export class SyncFailure extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
    readonly code: string | null = null,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SyncFailure'
  }
}

export interface SyncResult {
  uploaded: number
  downloaded: number
  skipped: number
  conflicts: number
  failed: number
  startedAt: string
  finishedAt: string
  errors: SyncError[]
}

export interface RemoteSyncGateway {
  verifyAuthenticatedOwner(ownerId: string): Promise<void>
  fetchCanonicalDefaults?(ownerId: string): Promise<RemoteDefaultSnapshot>
  applyOperation(operation: SyncOperation): Promise<RemoteMutationResult>
  downloadPage(
    ownerId: string,
    entityType: SyncEntityType,
    cursor: SyncCursor,
    limit: number,
  ): Promise<RemoteEntityChange[]>
}

export interface RemoteApplySummary {
  downloaded: number
  skipped: number
  conflicts: number
}

export interface RemoteDefaultSnapshot {
  categories: Category[]
  userSettings: UserSettings | null
}

export interface LocalSyncStore {
  findUploadable(ownerId: string): Promise<SyncOperation[]>
  markProcessing(operation: SyncOperation): Promise<void>
  markUploadError(operation: SyncOperation, message: string): Promise<void>
  completeUpload(
    operation: SyncOperation,
    result: RemoteMutationResult,
  ): Promise<void>
  countUploadable(ownerId: string): Promise<number>
  getCursor(ownerId: string, entityType: SyncEntityType): Promise<SyncCursor>
  applyRemotePage(
    ownerId: string,
    entityType: SyncEntityType,
    changes: RemoteEntityChange[],
    cursor: SyncCursor,
  ): Promise<RemoteApplySummary>
  markDownloadComplete(
    ownerId: string,
    entityType: SyncEntityType,
    completedAt: string,
  ): Promise<void>
  reconcileRemoteDefaults?(
    ownerId: string,
    snapshot: RemoteDefaultSnapshot,
    reconciledAt: string,
  ): Promise<void>
}

const DOWNLOAD_ORDER: readonly SyncEntityType[] = [
  'period',
  'balanceAnchor',
  'category',
  'recurringPayment',
  'recurringPaymentOccurrence',
  'income',
  'expense',
  'categoryBudget',
  'userSettings',
]

const PAGE_SIZE = 100

export class SyncCoordinator {
  private static readonly activeOwners = new Set<string>()

  constructor(
    private readonly local: LocalSyncStore,
    private readonly remote: RemoteSyncGateway,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  sync(ownerId: string): Promise<SyncResult> {
    return this.fullSync(ownerId)
  }

  async fullSync(ownerId: string): Promise<SyncResult> {
    return this.runExclusive(ownerId, async (result) => {
      await this.remote.verifyAuthenticatedOwner(ownerId)
      await this.reconcileDefaults(ownerId)
      const uploadSucceeded = await this.upload(ownerId, result)
      if (!uploadSucceeded) return
      await this.download(ownerId, result)
    })
  }

  async uploadPendingChanges(ownerId: string): Promise<SyncResult> {
    return this.runExclusive(ownerId, async (result) => {
      await this.remote.verifyAuthenticatedOwner(ownerId)
      await this.reconcileDefaults(ownerId)
      await this.upload(ownerId, result)
    })
  }

  async downloadRemoteChanges(ownerId: string): Promise<SyncResult> {
    return this.runExclusive(ownerId, async (result) => {
      await this.remote.verifyAuthenticatedOwner(ownerId)
      const remaining = await this.local.countUploadable(ownerId)
      if (remaining > 0) {
        result.failed += remaining
        result.errors.push({
          stage: 'upload',
          kind: 'validation',
          code: 'pending_uploads',
          retryable: false,
          message: `Hay ${remaining} operaciones locales sin confirmar; se omite la descarga.`,
        })
        return
      }
      await this.download(ownerId, result)
    })
  }

  private async upload(ownerId: string, result: SyncResult): Promise<boolean> {
    const operations = await this.local.findUploadable(ownerId)
    for (const operation of operations) {
      try {
        await this.local.markProcessing(operation)
        const remoteResult = await this.remote.applyOperation(operation)
        await this.local.completeUpload(operation, remoteResult)
        if (remoteResult.status === 'applied') result.uploaded += 1
        else result.skipped += 1
        if (remoteResult.status === 'remote_wins') result.conflicts += 1
      } catch (error) {
        const syncError = toSyncError(error, 'upload', operation.operationId)
        const message = syncError.message
        try {
          await this.local.markUploadError(operation, message)
        } catch (persistenceError) {
          result.errors.push({
            stage: 'upload',
            kind: 'unknown',
            code: 'persist_upload_error_failed',
            retryable: false,
            operationId: operation.operationId,
            message: `No se pudo persistir el error de subida: ${toErrorMessage(persistenceError)}`,
          })
        }
        result.failed += 1
        result.errors.push(syncError)
        return false
      }
    }

    const remaining = await this.local.countUploadable(ownerId)
    if (remaining > 0) {
      result.failed += remaining
      result.errors.push({
        stage: 'upload',
        kind: 'validation',
        code: 'pending_uploads',
        retryable: false,
        message: `Quedaron ${remaining} operaciones sin confirmar; se omite la descarga.`,
      })
      return false
    }
    return true
  }

  private async reconcileDefaults(ownerId: string): Promise<void> {
    if (
      !this.remote.fetchCanonicalDefaults ||
      !this.local.reconcileRemoteDefaults
    )
      return
    const snapshot = await this.remote.fetchCanonicalDefaults(ownerId)
    await this.local.reconcileRemoteDefaults(ownerId, snapshot, this.now())
  }

  private async download(ownerId: string, result: SyncResult): Promise<void> {
    for (const entityType of DOWNLOAD_ORDER) {
      try {
        let cursor = await this.local.getCursor(ownerId, entityType)
        while (true) {
          const page = await this.remote.downloadPage(
            ownerId,
            entityType,
            cursor,
            PAGE_SIZE,
          )
          if (page.length === 0) break
          const last = page.at(-1)
          if (!last) break
          const nextCursor: SyncCursor = {
            lastUpdatedAt: last.record.updatedAt,
            lastEntityId: last.record.id,
          }
          const summary = await this.local.applyRemotePage(
            ownerId,
            entityType,
            page,
            nextCursor,
          )
          result.downloaded += summary.downloaded
          result.skipped += summary.skipped
          result.conflicts += summary.conflicts
          cursor = nextCursor
          if (page.length < PAGE_SIZE) break
        }
        await this.local.markDownloadComplete(ownerId, entityType, this.now())
      } catch (error) {
        result.failed += 1
        result.errors.push(
          toSyncError(error, 'download', undefined, entityType),
        )
        return
      }
    }
  }

  private async runExclusive(
    ownerId: string,
    action: (result: SyncResult) => Promise<void>,
  ): Promise<SyncResult> {
    const startedAt = this.now()
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      startedAt,
      finishedAt: startedAt,
      errors: [],
    }

    if (ownerId.startsWith('guest:')) {
      return this.validationFailure(
        result,
        'Los propietarios guest:* son exclusivamente locales.',
      )
    }
    if (SyncCoordinator.activeOwners.has(ownerId)) {
      return this.validationFailure(
        result,
        'Ya hay una sincronización activa para este propietario.',
      )
    }

    SyncCoordinator.activeOwners.add(ownerId)
    try {
      await action(result)
    } catch (error) {
      result.failed += 1
      result.errors.push(toSyncError(error, 'validation'))
    } finally {
      SyncCoordinator.activeOwners.delete(ownerId)
      result.finishedAt = this.now()
    }
    return result
  }

  private validationFailure(result: SyncResult, message: string): SyncResult {
    result.failed = 1
    result.errors.push({
      stage: 'validation',
      kind: 'validation',
      code: 'invalid_sync_request',
      retryable: false,
      message,
    })
    result.finishedAt = this.now()
    return result
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Error de sincronización desconocido.'
}

function toSyncError(
  error: unknown,
  stage: SyncError['stage'],
  operationId?: string,
  entityType?: SyncEntityType,
): SyncError {
  const failure =
    error instanceof SyncFailure
      ? error
      : new SyncFailure('unknown', toErrorMessage(error), null, false, {
          cause: error,
        })
  return {
    stage,
    kind: failure.kind,
    code: failure.code,
    retryable: failure.retryable,
    message: failure.message,
    ...(operationId ? { operationId } : {}),
    ...(entityType ? { entityType } : {}),
  }
}
