import { afterAll, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BackupService } from '@application/services/BackupService'
import type { BackupData } from '@application/contracts/backup.schema'
import { GastoClaroDB } from '@infrastructure/local/database'
import { BACKUP_NOW, createBackupData } from '../../../tests/backup-fixtures'
import { BackupAdapter } from './BackupAdapter'

const sourceDatabase = new GastoClaroDB(
  `backup-property-source-${crypto.randomUUID()}`,
)
const destinationDatabase = new GastoClaroDB(
  `backup-property-destination-${crypto.randomUUID()}`,
)

afterAll(async () => {
  await Promise.all([sourceDatabase.delete(), destinationDatabase.delete()])
})

function withoutOwner(data: BackupData): BackupData {
  const normalize = <T extends { ownerId: string }>(records: T[]): T[] =>
    records.map((record) => ({ ...record, ownerId: 'normalized' }))
  return {
    periods: normalize(data.periods),
    incomes: normalize(data.incomes),
    expenses: normalize(data.expenses),
    categories: normalize(data.categories),
    categoryBudgets: normalize(data.categoryBudgets),
    recurringPayments: normalize(data.recurringPayments),
    recurringPaymentOccurrences: normalize(data.recurringPaymentOccurrences),
    userSettings: normalize(data.userSettings),
  }
}

describe('Feature: gasto-claro-app, Property 17: round-trip de respaldos', () => {
  it('exportar A, serializar e importar B conserva un estado equivalente', async () => {
    const sourceAdapter = new BackupAdapter(sourceDatabase)
    const destinationAdapter = new BackupAdapter(destinationDatabase)
    const sourceService = new BackupService(sourceAdapter, () => BACKUP_NOW)
    const destinationService = new BackupService(
      destinationAdapter,
      () => BACKUP_NOW,
    )

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          amount: fc.integer({ min: 1, max: 10_000_000 }),
          paddingSize: fc.integer({ min: 0, max: 4 }),
        }),
        async ({ amount, paddingSize }) => {
          const data = createBackupData('guest:generated', amount)
          const padding = ' '.repeat(paddingSize)
          data.incomes[0] = {
            ...data.incomes[0]!,
            description: `${padding}Ingreso${padding}`,
          }
          data.expenses[0] = {
            ...data.expenses[0]!,
            description: `${padding}Pago${padding}`,
          }
          data.categories[0] = {
            ...data.categories[0]!,
            name: `${padding}Servicios${padding}`,
            icon: `${padding}icono${padding}`,
          }
          data.recurringPayments[0] = {
            ...data.recurringPayments[0]!,
            name: `${padding}Internet${padding}`,
          }
          await sourceAdapter.replace('guest:a', data)
          const exported = await sourceService.exportBackup('guest:a')
          const prepared = destinationService.prepareImport(
            sourceService.serialize(exported),
          )
          await destinationService.importBackup('guest:b', prepared.file)
          const [source, destination] = await Promise.all([
            sourceAdapter.readActive('guest:a'),
            destinationAdapter.readActive('guest:b'),
          ])
          expect(withoutOwner(destination)).toEqual(withoutOwner(source))
        },
      ),
      { numRuns: 100 },
    )
  })
})
