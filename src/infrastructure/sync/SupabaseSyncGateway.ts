import type { SupabaseClient } from '@supabase/supabase-js'
import {
  remoteMutationResultSchema,
  remotePageSchema,
} from '@application/contracts/sync.schema'
import {
  SyncFailure,
  type RemoteDefaultSnapshot,
  type RemoteEntityChange,
  type RemoteMutationResult,
  type RemoteSyncGateway,
} from '@application/services/SyncCoordinator'
import type {
  Period,
  SyncCursor,
  SyncEntityType,
  SyncOperation,
} from '@domain/entities'
import type { Database } from '@infrastructure/remote/database.types'
import {
  deserializeRemoteChange,
  serializeOperationPayload,
} from './SyncMapper'

export class SupabaseSyncGateway implements RemoteSyncGateway {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async verifyAuthenticatedOwner(ownerId: string): Promise<void> {
    let response: Awaited<ReturnType<typeof this.client.auth.getUser>>
    try {
      response = await this.client.auth.getUser()
    } catch (error) {
      throw classifyRemoteFailure(error, 'No se pudo validar la sesión.')
    }
    const { data, error } = response
    if (error)
      throw classifyRemoteFailure(error, 'No se pudo validar la sesión.')
    if (!data.user)
      throw new SyncFailure(
        'unauthenticated',
        'Se requiere una sesión autenticada para sincronizar.',
        'missing_session',
      )
    if (data.user.id !== ownerId)
      throw new SyncFailure(
        'unauthenticated',
        'La sesión autenticada no coincide con el propietario local.',
        'owner_mismatch',
      )
  }

  async fetchCanonicalDefaults(
    ownerId: string,
  ): Promise<RemoteDefaultSnapshot> {
    let categoriesResponse
    let settingsResponse
    try {
      ;[categoriesResponse, settingsResponse] = await Promise.all([
        this.client
          .from('categories')
          .select('*')
          .eq('user_id', ownerId)
          .is('deleted_at', null),
        this.client
          .from('user_settings')
          .select('*')
          .eq('user_id', ownerId)
          .maybeSingle(),
      ])
    } catch (error) {
      throw classifyRemoteFailure(
        error,
        'No se pudieron consultar los registros predeterminados remotos.',
      )
    }

    if (categoriesResponse.error)
      throw classifyRemoteFailure(
        { ...categoriesResponse.error, status: categoriesResponse.status },
        'No se pudieron consultar las categorÃ­as predeterminadas remotas.',
      )
    if (settingsResponse.error)
      throw classifyRemoteFailure(
        { ...settingsResponse.error, status: settingsResponse.status },
        'No se pudo consultar la configuraciÃ³n remota.',
      )

    const categories = (categoriesResponse.data ?? []).map((row) => {
      const change = deserializeRemoteChange('category', row)
      if (change.entityType !== 'category')
        throw new Error('La categorÃ­a remota no pudo validarse.')
      return change.record
    })
    const settingsChange = settingsResponse.data
      ? deserializeRemoteChange('userSettings', settingsResponse.data)
      : null
    if (settingsChange && settingsChange.entityType !== 'userSettings')
      throw new Error('La configuraciÃ³n remota no pudo validarse.')

    return {
      categories,
      userSettings: settingsChange?.record ?? null,
    }
  }

  async findEquivalentPeriod(
    ownerId: string,
    candidate: Period,
  ): Promise<Period | null> {
    await this.verifyAuthenticatedOwner(ownerId)
    if (candidate.ownerId !== ownerId || candidate.deletedAt !== null) {
      throw new SyncFailure(
        'permission_denied',
        'El periodo local no pertenece al usuario autenticado.',
        'cross_owner_record',
      )
    }

    let response
    try {
      response = await this.client
        .from('periods')
        .select('*')
        .eq('user_id', ownerId)
        .eq('type', candidate.type)
        .eq('start_date', candidate.startDate)
        .eq('end_date', candidate.endDate)
        .is('deleted_at', null)
        .maybeSingle()
    } catch (error) {
      throw classifyRemoteFailure(
        error,
        'No se pudo buscar el periodo remoto equivalente.',
      )
    }
    if (response.error) {
      throw classifyRemoteFailure(
        { ...response.error, status: response.status },
        'No se pudo buscar el periodo remoto equivalente.',
      )
    }
    if (!response.data) return null

    const change = deserializeRemoteChange('period', response.data)
    if (change.entityType !== 'period')
      throw new SyncFailure(
        'validation',
        'El periodo remoto equivalente no pudo validarse.',
        'invalid_equivalent_period',
      )
    if (change.record.ownerId !== ownerId) {
      throw new SyncFailure(
        'permission_denied',
        'Supabase devolvió un periodo perteneciente a otro usuario.',
        'cross_owner_record',
      )
    }
    if (
      change.record.deletedAt !== null ||
      change.record.type !== candidate.type ||
      change.record.startDate !== candidate.startDate ||
      change.record.endDate !== candidate.endDate
    ) {
      return null
    }
    return change.record
  }

  async applyOperation(
    operation: SyncOperation,
  ): Promise<RemoteMutationResult> {
    let response
    try {
      response = await this.client.rpc<
        'apply_sync_operation',
        Database['public']['Functions']['apply_sync_operation']['Args']
      >('apply_sync_operation', {
        p_operation_id: operation.operationId,
        p_entity_type: operation.entityType,
        p_entity_id: operation.entityId,
        p_operation_type: operation.operationType,
        p_payload: serializeOperationPayload(operation),
      })
    } catch (error) {
      throw classifyRemoteFailure(error, 'Falló la subida de una operación.')
    }
    const { data, error, status } = response
    if (error)
      throw classifyRemoteFailure(
        { ...error, status },
        'Falló la subida de una operación.',
      )

    const result = remoteMutationResultSchema.parse(data)
    return {
      status: result.status,
      entityUpdatedAt: normalizeNullableInstant(result.entity_updated_at),
      relatedEntityId: result.related_entity_id ?? null,
      relatedUpdatedAt: normalizeNullableInstant(
        result.related_updated_at ?? null,
      ),
    }
  }

  async downloadPage(
    ownerId: string,
    entityType: SyncEntityType,
    cursor: SyncCursor,
    limit: number,
  ): Promise<RemoteEntityChange[]> {
    let response
    try {
      response = await this.client.rpc<
        'fetch_sync_changes',
        Database['public']['Functions']['fetch_sync_changes']['Args']
      >('fetch_sync_changes', {
        p_entity_type: entityType,
        p_updated_at: cursor.lastUpdatedAt ?? undefined,
        p_entity_id: cursor.lastEntityId ?? undefined,
        p_limit: limit,
      })
    } catch (error) {
      throw classifyRemoteFailure(error, `Falló la descarga de ${entityType}.`)
    }
    const { data, error, status } = response
    if (error)
      throw classifyRemoteFailure(
        { ...error, status },
        `Falló la descarga de ${entityType}.`,
      )

    return remotePageSchema.parse(data).map((row) => {
      const change = deserializeRemoteChange(entityType, row)
      if (change.record.ownerId !== ownerId) {
        throw new SyncFailure(
          'permission_denied',
          `Supabase devolvió un registro de ${entityType} perteneciente a otro usuario.`,
          'cross_owner_record',
        )
      }
      return change
    })
  }
}

interface RemoteErrorShape {
  code?: string
  message?: string
  status?: number
}

export function classifyRemoteFailure(
  error: unknown,
  fallback: string,
): SyncFailure {
  if (error instanceof SyncFailure) return error
  const remote = isRemoteError(error) ? error : null
  const code = remote?.code ?? null
  const status = remote?.status
  const message =
    remote?.message ?? (error instanceof Error ? error.message : '')
  const normalized = message.toLowerCase()

  if (status === 401 || code === 'PGRST301')
    return new SyncFailure('unauthenticated', fallback, code, true, {
      cause: error,
    })
  if (status === 403 || code === '42501')
    return new SyncFailure('permission_denied', fallback, code, false, {
      cause: error,
    })
  if (code?.startsWith('22') || code === '23503' || code === '23514')
    return new SyncFailure('validation', fallback, code, false, {
      cause: error,
    })
  if (status === 409 || code === '23505' || code === '23P01')
    return new SyncFailure('conflict', fallback, code, false, { cause: error })
  if (status === 400)
    return new SyncFailure('validation', fallback, code, false, {
      cause: error,
    })
  if (
    status === 408 ||
    status === 429 ||
    code === 'PGRST000' ||
    code === 'PGRST001' ||
    code === 'PGRST002' ||
    code === 'PGRST003' ||
    code === '57014'
  )
    return new SyncFailure('server', fallback, code, true, { cause: error })
  if (status !== undefined && status >= 500)
    return new SyncFailure('server', fallback, code, true, { cause: error })
  if (
    code?.startsWith('08') ||
    error instanceof TypeError ||
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout')
  )
    return new SyncFailure('network', fallback, code, true, { cause: error })
  if (normalized.includes('jwt'))
    return new SyncFailure('unauthenticated', fallback, code, true, {
      cause: error,
    })
  return new SyncFailure('unknown', fallback, code, false, { cause: error })
}

function isRemoteError(error: unknown): error is RemoteErrorShape {
  return typeof error === 'object' && error !== null
}

function normalizeNullableInstant(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}
