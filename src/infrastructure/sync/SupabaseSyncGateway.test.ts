import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Period } from '@domain/entities'
import type { Database } from '@infrastructure/remote/database.types'
import { SupabaseSyncGateway } from './SupabaseSyncGateway'

const ownerId = '10000000-0000-4000-8000-000000000001'
const aliasId = '20000000-0000-4000-8000-000000000002'
const canonicalId = '30000000-0000-4000-8000-000000000003'
const instant = '2026-08-01T10:00:00.000Z'

const candidate: Period = {
  id: aliasId,
  ownerId,
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  createdAt: instant,
  updatedAt: instant,
  deletedAt: null,
  syncStatus: 'pending',
}

function remoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: canonicalId,
    user_id: ownerId,
    type: 'monthly',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    created_at: instant,
    updated_at: instant,
    deleted_at: null,
    ...overrides,
  }
}

function clientFor(response: {
  data: ReturnType<typeof remoteRow> | null
  error: null | { code: string; message: string }
  status: number
}) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(response),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient<Database>
  return { client, chain }
}

describe('SupabaseSyncGateway.findEquivalentPeriod', () => {
  it('consulta por propietario y equivalencia exacta bajo la sesión autenticada', async () => {
    const { client, chain } = clientFor({
      data: remoteRow(),
      error: null,
      status: 200,
    })

    const result = await new SupabaseSyncGateway(client).findEquivalentPeriod(
      ownerId,
      candidate,
    )

    expect(result).toMatchObject({
      id: canonicalId,
      ownerId,
      type: candidate.type,
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      deletedAt: null,
      syncStatus: 'synced',
    })
    expect(client.auth.getUser).toHaveBeenCalledOnce()
    expect(client.from).toHaveBeenCalledWith('periods')
    expect(chain.eq.mock.calls).toEqual([
      ['user_id', ownerId],
      ['type', 'monthly'],
      ['start_date', '2026-08-01'],
      ['end_date', '2026-08-31'],
    ])
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it.each([
    ['tipo distinto', { type: 'biweekly' }],
    ['solapamiento parcial', { end_date: '2026-08-30' }],
    ['periodo eliminado', { deleted_at: instant }],
  ])('rechaza defensivamente un resultado de %s', async (_label, overrides) => {
    const { client } = clientFor({
      data: remoteRow(overrides),
      error: null,
      status: 200,
    })

    await expect(
      new SupabaseSyncGateway(client).findEquivalentPeriod(ownerId, candidate),
    ).resolves.toBeNull()
  })

  it('devuelve null cuando RLS no expone un equivalente activo', async () => {
    const { client } = clientFor({ data: null, error: null, status: 200 })

    await expect(
      new SupabaseSyncGateway(client).findEquivalentPeriod(ownerId, candidate),
    ).resolves.toBeNull()
  })

  it('rechaza un candidato de otro propietario antes de consultar la tabla', async () => {
    const { client } = clientFor({ data: null, error: null, status: 200 })

    await expect(
      new SupabaseSyncGateway(client).findEquivalentPeriod(ownerId, {
        ...candidate,
        ownerId: '40000000-0000-4000-8000-000000000004',
      }),
    ).rejects.toMatchObject({
      kind: 'permission_denied',
      code: 'cross_owner_record',
    })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('rechaza una fila remota de otro propietario', async () => {
    const { client } = clientFor({
      data: remoteRow({
        user_id: '40000000-0000-4000-8000-000000000004',
      }),
      error: null,
      status: 200,
    })

    await expect(
      new SupabaseSyncGateway(client).findEquivalentPeriod(ownerId, candidate),
    ).rejects.toMatchObject({
      kind: 'permission_denied',
      code: 'cross_owner_record',
    })
  })

  it('clasifica los errores de consulta sin filtrar detalles remotos', async () => {
    const { client } = clientFor({
      data: null,
      error: { code: '42501', message: 'detalle sensible' },
      status: 403,
    })

    await expect(
      new SupabaseSyncGateway(client).findEquivalentPeriod(ownerId, candidate),
    ).rejects.toMatchObject({
      kind: 'permission_denied',
      code: '42501',
      message: 'No se pudo buscar el periodo remoto equivalente.',
    })
  })
})
