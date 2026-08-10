import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { remoteRowSchemas } from '@application/contracts/sync.schema'
import {
  deviceSyncStateArbitrary,
  remoteRowArbitraryByEntityType,
  syncErrorArbitrary,
  syncOperationArbitrary,
  synchronizableEntitySetArbitrary,
  tombstoneArbitrary,
} from './property/arbitraries'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

describe('propiedades de los arbitraries de sincronizacion', () => {
  it('configura el seed global cuando VITE_FAST_CHECK_SEED esta definido', () => {
    const configuredSeed = import.meta.env.VITE_FAST_CHECK_SEED
    expect(fc.readConfigureGlobal().seed).toBe(
      configuredSeed ? Number(configuredSeed) : undefined,
    )
  })

  it('PBT: el grafo generado conserva propietarios, FKs y tipos de dominio', () => {
    fc.assert(
      fc.property(synchronizableEntitySetArbitrary, (entities) => {
        const ownerIds = [
          entities.period.ownerId,
          entities.income.ownerId,
          entities.expense.ownerId,
          entities.category.ownerId,
          entities.categoryBudget.ownerId,
          entities.recurringPayment.ownerId,
          entities.recurringPaymentOccurrence.ownerId,
          entities.userSettings.ownerId,
        ]
        expect(new Set(ownerIds)).toHaveLength(1)
        expect(ownerIds[0]).toMatch(uuidPattern)
        expect(entities.income.periodId).toBe(entities.period.id)
        expect(entities.expense.periodId).toBe(entities.period.id)
        expect(entities.expense.categoryId).toBe(entities.category.id)
        expect(entities.categoryBudget.periodId).toBe(entities.period.id)
        expect(entities.categoryBudget.categoryId).toBe(entities.category.id)
        expect(entities.recurringPayment.categoryId).toBe(entities.category.id)
        expect(entities.recurringPaymentOccurrence.periodId).toBe(
          entities.period.id,
        )
        expect(entities.recurringPaymentOccurrence.recurringPaymentId).toBe(
          entities.recurringPayment.id,
        )
        expect(entities.period.startDate).toMatch(dateOnlyPattern)
        expect(entities.period.endDate).toMatch(dateOnlyPattern)
        expect(Number.isInteger(entities.income.amount)).toBe(true)
        expect(Number.isInteger(entities.expense.amount)).toBe(true)
        expect(Number.isInteger(entities.categoryBudget.amount)).toBe(true)
        expect(Number.isInteger(entities.recurringPayment.amount)).toBe(true)
        if (entities.recurringPaymentOccurrence.status === 'paid') {
          expect(entities.recurringPaymentOccurrence.transactionId).toBe(
            entities.expense.id,
          )
          expect(entities.expense.recurringOccurrenceId).toBe(
            entities.recurringPaymentOccurrence.id,
          )
        } else {
          expect(entities.recurringPaymentOccurrence.transactionId).toBeNull()
          expect(entities.expense.recurringOccurrenceId).toBeNull()
        }
      }),
      { numRuns: 100 },
    )
  })

  it('PBT: cada RemoteRow generada satisface el contrato snake_case', () => {
    fc.assert(
      fc.property(fc.record(remoteRowArbitraryByEntityType), (remoteRows) => {
        expect(
          remoteRowSchemas.period.safeParse(remoteRows.period).success,
        ).toBe(true)
        expect(
          remoteRowSchemas.income.safeParse(remoteRows.income).success,
        ).toBe(true)
        expect(
          remoteRowSchemas.expense.safeParse(remoteRows.expense).success,
        ).toBe(true)
        expect(
          remoteRowSchemas.category.safeParse(remoteRows.category).success,
        ).toBe(true)
        expect(
          remoteRowSchemas.categoryBudget.safeParse(remoteRows.categoryBudget)
            .success,
        ).toBe(true)
        expect(
          remoteRowSchemas.recurringPayment.safeParse(
            remoteRows.recurringPayment,
          ).success,
        ).toBe(true)
        expect(
          remoteRowSchemas.recurringPaymentOccurrence.safeParse(
            remoteRows.recurringPaymentOccurrence,
          ).success,
        ).toBe(true)
        expect(
          remoteRowSchemas.userSettings.safeParse(remoteRows.userSettings)
            .success,
        ).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('PBT: operaciones, cursores, tombstones y errores generados son coherentes', () => {
    fc.assert(
      fc.property(
        syncOperationArbitrary,
        deviceSyncStateArbitrary,
        tombstoneArbitrary,
        syncErrorArbitrary,
        (operation, state, tombstone, syncError) => {
          const payload: unknown = JSON.parse(operation.payload)
          expect(isRecord(payload)).toBe(true)
          if (!isRecord(payload)) return
          expect(payload.id).toBe(operation.entityId)
          expect(payload.ownerId).toBe(operation.ownerId)
          expect(operation.operationId).toMatch(uuidPattern)
          expect(state.ownerId).toMatch(uuidPattern)
          expect(state.lastUpdatedAt === null).toBe(state.lastEntityId === null)
          expect(tombstone.deletedAt).toBe(tombstone.updatedAt)
          expect(tombstone.syncStatus).toBe('synced')
          expect(syncError.retryable).toBe(
            syncError.kind === 'network' || syncError.kind === 'server',
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
