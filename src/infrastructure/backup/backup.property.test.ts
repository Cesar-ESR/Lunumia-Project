import { afterAll, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BackupService } from '@application/services/BackupService'
import type { BackupData } from '@application/contracts/backup.schema'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  BACKUP_NOW,
  createBackupData,
  createLegacyBackupFileV1,
} from '../../../tests/backup-fixtures'
import { BackupAdapter } from './BackupAdapter'
import { DexieBalanceAnchorRepository } from '@infrastructure/local/repositories'

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
    balanceAnchors: normalize(data.balanceAnchors),
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

  it('preserva campos Domain 2.0, snapshots y el latest anchor', async () => {
    const sourceAdapter = new BackupAdapter(sourceDatabase)
    const destinationAdapter = new BackupAdapter(destinationDatabase)
    const sourceService = new BackupService(sourceAdapter, () => BACKUP_NOW)
    const destinationService = new BackupService(
      destinationAdapter,
      () => BACKUP_NOW,
    )
    const data = createBackupData('guest:source', 5_000)
    const income = data.incomes[0]!
    data.incomes = [
      income,
      {
        ...income,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      },
      {
        ...income,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'cancelled',
        affectsBalance: false,
        balanceEffectiveAt: null,
      },
      {
        ...income,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        affectsBalance: false,
        balanceEffectiveAt: null,
      },
    ]
    data.expenses[0]!.affectsBalance = false
    data.recurringPayments[0]!.amount = 9_000
    data.recurringPaymentOccurrences[0]!.amount = 5_000
    const anchor = data.balanceAnchors[0]!
    data.balanceAnchors = [
      {
        ...anchor,
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        amount: 100,
        capturedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        ...anchor,
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        amount: 0,
        capturedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        ...anchor,
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        amount: -100,
        capturedAt: '2026-07-31T00:00:00.000Z',
      },
    ]

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
    expect(destination.incomes.map(({ status }) => status)).toEqual([
      'received',
      'expected',
      'cancelled',
      'received',
    ])
    expect(destination.expenses[0]?.affectsBalance).toBe(false)
    expect(destination.recurringPaymentOccurrences[0]?.amount).toBe(5_000)
    expect(destination.recurringPayments[0]?.amount).toBe(9_000)
    expect(destination.balanceAnchors.map(({ amount }) => amount)).toEqual([
      100, 0, -100,
    ])

    const sourceAnchors = new DexieBalanceAnchorRepository(
      sourceDatabase,
      'guest:a',
    )
    const destinationAnchors = new DexieBalanceAnchorRepository(
      destinationDatabase,
      'guest:b',
    )
    const [sourceLatest, destinationLatest] = await Promise.all([
      sourceAnchors.findLatest(),
      destinationAnchors.findLatest(),
    ])
    expect(destinationLatest?.id).toBe(sourceLatest?.id)
    expect(destinationLatest?.amount).toBe(sourceLatest?.amount)
  })

  it('importar v1 no crea BalanceAnchor', async () => {
    const destinationAdapter = new BackupAdapter(destinationDatabase)
    const service = new BackupService(destinationAdapter, () => BACKUP_NOW)
    const legacy = createLegacyBackupFileV1('guest:legacy')

    const prepared = service.prepareImport(JSON.stringify(legacy))
    await service.importBackup('guest:b', prepared.file)

    const restored = await destinationAdapter.readActive('guest:b')
    expect(restored.balanceAnchors).toEqual([])
    expect(restored.incomes[0]).toMatchObject({
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: restored.incomes[0]?.createdAt,
    })
  })
})
