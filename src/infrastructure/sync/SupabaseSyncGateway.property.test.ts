import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SyncErrorKind } from '@application/services/SyncCoordinator'
import { classifyRemoteFailure } from './SupabaseSyncGateway'

interface ClassificationCase {
  createError(): unknown
  kind: SyncErrorKind
  retryable: boolean
}

const classificationCases: readonly ClassificationCase[] = [
  {
    createError: () => ({ status: 401, code: '42501', message: 'forbidden' }),
    kind: 'unauthenticated',
    retryable: true,
  },
  {
    createError: () => ({ code: 'PGRST301', message: 'invalid token' }),
    kind: 'unauthenticated',
    retryable: true,
  },
  {
    createError: () => ({ code: '42501', message: 'jwt network timeout' }),
    kind: 'permission_denied',
    retryable: false,
  },
  {
    createError: () => ({ code: '23505', message: 'jwt network timeout' }),
    kind: 'conflict',
    retryable: false,
  },
  {
    createError: () => ({ code: '23P01', message: 'exclusion violation' }),
    kind: 'conflict',
    retryable: false,
  },
  {
    createError: () => ({ code: '23503', message: 'network timeout' }),
    kind: 'validation',
    retryable: false,
  },
  {
    createError: () => ({
      status: 409,
      code: '23503',
      message: 'foreign key violation',
    }),
    kind: 'validation',
    retryable: false,
  },
  {
    createError: () => ({ code: '22023', message: 'invalid parameter' }),
    kind: 'validation',
    retryable: false,
  },
  {
    createError: () => ({ status: 408, message: 'request timeout' }),
    kind: 'server',
    retryable: true,
  },
  {
    createError: () => ({ code: 'PGRST003', message: 'pool timeout' }),
    kind: 'server',
    retryable: true,
  },
  {
    createError: () => ({ status: 503, message: 'service unavailable' }),
    kind: 'server',
    retryable: true,
  },
  {
    createError: () => ({ code: '08006', message: 'connection failure' }),
    kind: 'network',
    retryable: true,
  },
  {
    createError: () => new TypeError('Failed to fetch secret token'),
    kind: 'network',
    retryable: true,
  },
  {
    createError: () => ({ message: 'jwt expired' }),
    kind: 'unauthenticated',
    retryable: true,
  },
  {
    createError: () => ({ code: 'unexpected', message: 'technical detail' }),
    kind: 'unknown',
    retryable: false,
  },
]

describe('propiedades de clasificacion de errores remotos', () => {
  it('PBT: codigo y status determinan una clasificacion estable y segura', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...classificationCases),
        (classificationCase) => {
          const failure = classifyRemoteFailure(
            classificationCase.createError(),
            'No fue posible sincronizar.',
          )

          expect(failure.kind).toBe(classificationCase.kind)
          expect(failure.retryable).toBe(classificationCase.retryable)
          expect(failure.message).toBe('No fue posible sincronizar.')
          expect(failure.message).not.toMatch(/secret|token|payload/i)
        },
      ),
      { numRuns: 300 },
    )
  })
})
