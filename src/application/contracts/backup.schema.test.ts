import { backupFileSchema } from './backup.schema'
import { createBackupFile } from '../../../tests/backup-fixtures'

describe('backup schema v2', () => {
  it.each([50_000, 0, -50_000])(
    'acepta BalanceAnchor firmado con amount=%i',
    (amount) => {
      const file = createBackupFile()
      file.data.balanceAnchors[0]!.amount = amount
      expect(backupFileSchema.parse(file).data.balanceAnchors[0]?.amount).toBe(
        amount,
      )
    },
  )

  it('preserva statuses y semántica de balance actuales', () => {
    const file = createBackupFile()
    const received = file.data.incomes[0]!
    file.data.incomes = [
      received,
      {
        ...received,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'expected',
        affectsBalance: false,
        balanceEffectiveAt: null,
      },
      {
        ...received,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'cancelled',
        affectsBalance: false,
        balanceEffectiveAt: null,
      },
    ]
    file.data.expenses[0]!.affectsBalance = false

    const parsed = backupFileSchema.parse(file)

    expect(parsed.data.incomes.map(({ status }) => status)).toEqual([
      'received',
      'expected',
      'cancelled',
    ])
    expect(parsed.data.incomes.slice(1)).toEqual(file.data.incomes.slice(1))
    expect(parsed.data.expenses[0]?.affectsBalance).toBe(false)
  })

  it('rechaza dinero y timestamps inválidos', () => {
    const invalidMoney = createBackupFile()
    invalidMoney.data.balanceAnchors[0]!.amount = 1.5
    expect(backupFileSchema.safeParse(invalidMoney).success).toBe(false)

    const invalidInstant = createBackupFile()
    invalidInstant.data.balanceAnchors[0]!.capturedAt = '2026-07-31'
    expect(backupFileSchema.safeParse(invalidInstant).success).toBe(false)

    const invalidOccurrence = createBackupFile()
    invalidOccurrence.data.recurringPaymentOccurrences[0]!.amount = 0
    expect(backupFileSchema.safeParse(invalidOccurrence).success).toBe(false)
  })

  it('no permite persistir derivados ni metadata interna', () => {
    const file = {
      ...createBackupFile(),
      data: {
        ...createBackupFile().data,
        financialSnapshot: {},
      },
    }
    expect(backupFileSchema.safeParse(file).success).toBe(false)
  })
})
