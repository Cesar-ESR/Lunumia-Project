import type {
  BackupData,
  BackupFile,
  LegacyBackupFileV1,
} from '@application/contracts/backup.schema'
import {
  APP_NAME,
  BACKUP_SCHEMA_VERSION_V1,
  CURRENT_BACKUP_SCHEMA_VERSION,
} from '@shared/constants'

export const BACKUP_NOW = '2026-07-31T18:00:00.000Z'
export const PERIOD_ID = '11111111-1111-4111-8111-111111111111'
export const CATEGORY_ID = '22222222-2222-4222-8222-222222222222'
export const EXPENSE_ID = '33333333-3333-4333-8333-333333333333'
export const OCCURRENCE_ID = '77777777-7777-4777-8777-777777777777'
export const BALANCE_ANCHOR_ID = '99999999-9999-4999-8999-999999999999'

export function createBackupData(
  ownerId = 'guest:source',
  amount = 12500,
): BackupData {
  const syncable = {
    ownerId,
    createdAt: BACKUP_NOW,
    updatedAt: BACKUP_NOW,
    deletedAt: null,
    syncStatus: 'pending' as const,
  }
  return {
    periods: [
      {
        id: PERIOD_ID,
        type: 'monthly',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        ...syncable,
      },
    ],
    incomes: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        periodId: PERIOD_ID,
        amount: amount + 100,
        description: 'Ingreso',
        date: '2026-07-01',
        status: 'received',
        affectsBalance: true,
        balanceEffectiveAt: BACKUP_NOW,
        ...syncable,
      },
    ],
    expenses: [
      {
        id: EXPENSE_ID,
        periodId: PERIOD_ID,
        categoryId: CATEGORY_ID,
        amount,
        description: 'Pago',
        date: '2026-07-15',
        recurringOccurrenceId: OCCURRENCE_ID,
        affectsBalance: true,
        balanceEffectiveAt: BACKUP_NOW,
        ...syncable,
      },
    ],
    categories: [
      {
        id: CATEGORY_ID,
        name: 'Servicios',
        normalizedName: 'servicios',
        color: '#176B55',
        icon: null,
        isSystem: false,
        ...syncable,
      },
    ],
    categoryBudgets: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        periodId: PERIOD_ID,
        categoryId: CATEGORY_ID,
        amount: amount + 500,
        ...syncable,
      },
    ],
    recurringPayments: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Internet',
        amount,
        frequency: 'monthly',
        dueDate: '2026-07-15',
        endDate: null,
        categoryId: CATEGORY_ID,
        status: 'active',
        ...syncable,
      },
    ],
    recurringPaymentOccurrences: [
      {
        id: OCCURRENCE_ID,
        recurringPaymentId: '66666666-6666-4666-8666-666666666666',
        periodId: PERIOD_ID,
        dueDate: '2026-07-15',
        status: 'paid',
        transactionId: EXPENSE_ID,
        amount,
        ...syncable,
      },
    ],
    balanceAnchors: [
      {
        id: BALANCE_ANCHOR_ID,
        amount: 50_000,
        capturedAt: BACKUP_NOW,
        ledgerCutoffAt: BACKUP_NOW,
        ...syncable,
      },
    ],
    userSettings: [
      {
        id: '88888888-8888-4888-8888-888888888888',
        ownerId,
        activePeriodId: PERIOD_ID,
        currency: 'MXN',
        theme: 'system',
        createdAt: BACKUP_NOW,
        updatedAt: BACKUP_NOW,
      },
    ],
  }
}

export function createBackupFile(
  ownerId = 'guest:source',
  amount = 12500,
): BackupFile {
  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    appName: APP_NAME,
    exportedAt: BACKUP_NOW,
    ownerId,
    data: createBackupData(ownerId, amount),
  }
}

export function createLegacyBackupFileV1(
  ownerId = 'guest:source',
  amount = 12500,
): LegacyBackupFileV1 {
  const current = createBackupData(ownerId, amount)
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION_V1,
    appName: APP_NAME,
    exportedAt: BACKUP_NOW,
    ownerId,
    data: {
      periods: current.periods,
      incomes: current.incomes.map(
        ({ status, affectsBalance, balanceEffectiveAt, ...income }) => {
          void status
          void affectsBalance
          void balanceEffectiveAt
          return income
        },
      ),
      expenses: current.expenses.map(
        ({ affectsBalance, balanceEffectiveAt, ...expense }) => {
          void affectsBalance
          void balanceEffectiveAt
          return expense
        },
      ),
      categories: current.categories,
      categoryBudgets: current.categoryBudgets,
      recurringPayments: current.recurringPayments,
      recurringPaymentOccurrences: current.recurringPaymentOccurrences.map(
        ({ amount: occurrenceAmount, ...occurrence }) => {
          void occurrenceAmount
          return occurrence
        },
      ),
      userSettings: current.userSettings,
    },
  }
}
