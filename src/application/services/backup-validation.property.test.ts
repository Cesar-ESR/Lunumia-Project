import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { BackupDataSource } from './BackupDataSource'
import { BackupError } from './BackupErrors'
import { BackupService } from './BackupService'
import {
  createBackupData,
  createBackupFile,
} from '../../../tests/backup-fixtures'

type InvalidVariant =
  | 'missing-periods'
  | 'wrong-amount'
  | 'bad-date'
  | 'broken-reference'
  | 'future-version'

function invalidSerialized(variant: InvalidVariant, amount: number): string {
  const file = createBackupFile('guest:source', amount)
  switch (variant) {
    case 'missing-periods': {
      const { periods, ...data } = file.data
      void periods
      return JSON.stringify({ ...file, data })
    }
    case 'wrong-amount':
      return JSON.stringify({
        ...file,
        data: {
          ...file.data,
          expenses: [{ ...file.data.expenses[0]!, amount: 'incorrecto' }],
        },
      })
    case 'bad-date':
      return JSON.stringify({
        ...file,
        data: {
          ...file.data,
          periods: [{ ...file.data.periods[0]!, startDate: '2026-02-31' }],
        },
      })
    case 'broken-reference':
      return JSON.stringify({
        ...file,
        data: {
          ...file.data,
          incomes: [
            {
              ...file.data.incomes[0]!,
              periodId: '99999999-9999-4999-8999-999999999999',
            },
          ],
        },
      })
    case 'future-version':
      return JSON.stringify({ ...file, schemaVersion: 999 })
  }
}

describe('Feature: gasto-claro-app, Property 18: Zod rechaza respaldos inválidos', () => {
  it('rechaza mutaciones inválidas, explica la causa y no escribe', () => {
    let writes = 0
    const existing = createBackupData('guest:local', 50)
    const source: BackupDataSource = {
      readActive: async () => existing,
      replace: async () => {
        writes += 1
      },
    }
    const service = new BackupService(source)

    fc.assert(
      fc.property(
        fc.constantFrom<InvalidVariant>(
          'missing-periods',
          'wrong-amount',
          'bad-date',
          'broken-reference',
          'future-version',
        ),
        fc.integer({ min: 1, max: 1_000_000 }),
        (variant, amount) => {
          let caught: unknown
          try {
            service.prepareImport(invalidSerialized(variant, amount))
          } catch (reason) {
            caught = reason
          }
          expect(caught).toBeInstanceOf(BackupError)
          expect((caught as BackupError).message.length).toBeGreaterThan(10)
          expect(writes).toBe(0)
          expect(existing.expenses[0]?.amount).toBe(50)
        },
      ),
      { numRuns: 100 },
    )
  })
})
