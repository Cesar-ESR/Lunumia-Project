import { z } from 'zod'
import {
  backupFileSchema,
  backupVersionEnvelopeSchema,
  type BackupData,
  type BackupFile,
} from '@application/contracts/backup.schema'
import { APP_NAME, CURRENT_BACKUP_SCHEMA_VERSION } from '@shared/constants'
import type { BackupDataSource } from './BackupDataSource'
import { BackupError } from './BackupErrors'

export interface BackupSummary {
  schemaVersion: number
  exportedAt: string
  counts: Record<keyof BackupData, number>
}

export interface PreparedBackup {
  file: BackupFile
  summary: BackupSummary
}

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'El archivo no cumple el esquema de respaldo.'
  const path = issue.path.length > 0 ? issue.path.join('.') : 'archivo'
  return `${path}: ${issue.message}`
}

function assertReference(
  ids: Set<string>,
  id: string,
  path: string,
  target: string,
): void {
  if (!ids.has(id)) {
    throw new BackupError(
      'BACKUP_INTEGRITY_ERROR',
      `${path} referencia ${target} inexistente (${id}).`,
    )
  }
}

function assertUnique(values: string[], path: string): void {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value)) {
      throw new BackupError(
        'BACKUP_INTEGRITY_ERROR',
        `${path}.${index} contiene un valor duplicado (${value}).`,
      )
    }
    seen.add(value)
  })
}

export function validateBackupIntegrity(data: BackupData): void {
  const periodIds = new Set(data.periods.map(({ id }) => id))
  const categoryIds = new Set(data.categories.map(({ id }) => id))
  const paymentIds = new Set(data.recurringPayments.map(({ id }) => id))
  const occurrenceIds = new Set(
    data.recurringPaymentOccurrences.map(({ id }) => id),
  )
  const expenseIds = new Set(data.expenses.map(({ id }) => id))

  assertUnique(
    data.periods.map(({ id }) => id),
    'data.periods',
  )
  assertUnique(
    data.incomes.map(({ id }) => id),
    'data.incomes',
  )
  assertUnique(
    data.expenses.map(({ id }) => id),
    'data.expenses',
  )
  assertUnique(
    data.categories.map(({ id }) => id),
    'data.categories',
  )
  assertUnique(
    data.categoryBudgets.map(({ id }) => id),
    'data.categoryBudgets',
  )
  assertUnique(
    data.recurringPayments.map(({ id }) => id),
    'data.recurringPayments',
  )
  assertUnique(
    data.recurringPaymentOccurrences.map(({ id }) => id),
    'data.recurringPaymentOccurrences',
  )
  assertUnique(
    data.userSettings.map(({ id }) => id),
    'data.userSettings',
  )
  assertUnique(
    data.categories.map(({ normalizedName }) => normalizedName),
    'data.categories.normalizedName',
  )
  assertUnique(
    data.categoryBudgets.map(
      ({ periodId, categoryId }) => `${periodId}:${categoryId}`,
    ),
    'data.categoryBudgets.periodCategory',
  )
  assertUnique(
    data.recurringPaymentOccurrences.map(
      ({ recurringPaymentId, dueDate }) => `${recurringPaymentId}:${dueDate}`,
    ),
    'data.recurringPaymentOccurrences.paymentDate',
  )

  data.categories.forEach((category, index) => {
    if (category.normalizedName !== category.name.trim().toLowerCase()) {
      throw new BackupError(
        'BACKUP_INTEGRITY_ERROR',
        `data.categories.${index}.normalizedName no coincide con el nombre normalizado.`,
      )
    }
  })

  data.incomes.forEach((income, index) => {
    assertReference(
      periodIds,
      income.periodId,
      `data.incomes.${index}.periodId`,
      'un periodo',
    )
    const period = data.periods.find(({ id }) => id === income.periodId)
    if (
      period &&
      (income.date < period.startDate || income.date > period.endDate)
    ) {
      throw new BackupError(
        'BACKUP_INTEGRITY_ERROR',
        `data.incomes.${index}.date está fuera del periodo relacionado.`,
      )
    }
  })
  data.expenses.forEach((expense, index) => {
    assertReference(
      periodIds,
      expense.periodId,
      `data.expenses.${index}.periodId`,
      'un periodo',
    )
    assertReference(
      categoryIds,
      expense.categoryId,
      `data.expenses.${index}.categoryId`,
      'una categoría',
    )
    const period = data.periods.find(({ id }) => id === expense.periodId)
    if (
      period &&
      (expense.date < period.startDate || expense.date > period.endDate)
    ) {
      throw new BackupError(
        'BACKUP_INTEGRITY_ERROR',
        `data.expenses.${index}.date está fuera del periodo relacionado.`,
      )
    }
    if (expense.recurringOccurrenceId !== null) {
      assertReference(
        occurrenceIds,
        expense.recurringOccurrenceId,
        `data.expenses.${index}.recurringOccurrenceId`,
        'una ocurrencia',
      )
      const occurrence = data.recurringPaymentOccurrences.find(
        ({ id }) => id === expense.recurringOccurrenceId,
      )
      if (
        occurrence?.status !== 'paid' ||
        occurrence.transactionId !== expense.id
      ) {
        throw new BackupError(
          'BACKUP_INTEGRITY_ERROR',
          `data.expenses.${index}.recurringOccurrenceId no tiene un vínculo pagado recíproco.`,
        )
      }
    }
  })
  data.categoryBudgets.forEach((budget, index) => {
    assertReference(
      periodIds,
      budget.periodId,
      `data.categoryBudgets.${index}.periodId`,
      'un periodo',
    )
    assertReference(
      categoryIds,
      budget.categoryId,
      `data.categoryBudgets.${index}.categoryId`,
      'una categoría',
    )
  })
  data.recurringPayments.forEach((payment, index) =>
    assertReference(
      categoryIds,
      payment.categoryId,
      `data.recurringPayments.${index}.categoryId`,
      'una categoría',
    ),
  )
  data.recurringPaymentOccurrences.forEach((occurrence, index) => {
    assertReference(
      paymentIds,
      occurrence.recurringPaymentId,
      `data.recurringPaymentOccurrences.${index}.recurringPaymentId`,
      'un pago recurrente',
    )
    assertReference(
      periodIds,
      occurrence.periodId,
      `data.recurringPaymentOccurrences.${index}.periodId`,
      'un periodo',
    )
    const period = data.periods.find(({ id }) => id === occurrence.periodId)
    if (
      period &&
      (occurrence.dueDate < period.startDate ||
        occurrence.dueDate > period.endDate)
    ) {
      throw new BackupError(
        'BACKUP_INTEGRITY_ERROR',
        `data.recurringPaymentOccurrences.${index}.dueDate está fuera del periodo relacionado.`,
      )
    }
    if (occurrence.transactionId !== null) {
      assertReference(
        expenseIds,
        occurrence.transactionId,
        `data.recurringPaymentOccurrences.${index}.transactionId`,
        'un gasto',
      )
      const expense = data.expenses.find(
        ({ id }) => id === occurrence.transactionId,
      )
      if (expense?.recurringOccurrenceId !== occurrence.id) {
        throw new BackupError(
          'BACKUP_INTEGRITY_ERROR',
          `data.recurringPaymentOccurrences.${index}.transactionId no tiene un vínculo recíproco con la ocurrencia.`,
        )
      }
    }
  })
  data.userSettings.forEach((settings, index) => {
    if (settings.activePeriodId !== null) {
      assertReference(
        periodIds,
        settings.activePeriodId,
        `data.userSettings.${index}.activePeriodId`,
        'un periodo',
      )
    }
  })
}

type BackupMigration = (input: unknown) => unknown
const backupMigrations: Partial<Record<number, BackupMigration>> = {}

function migrateBackup(input: unknown, sourceVersion: number): unknown {
  let migrated = input
  let version = sourceVersion
  while (version < CURRENT_BACKUP_SCHEMA_VERSION) {
    const migration = backupMigrations[version]
    if (!migration) {
      throw new BackupError(
        'UNSUPPORTED_BACKUP_VERSION',
        `No existe una migración desde la versión ${version}.`,
      )
    }
    migrated = migration(migrated)
    version += 1
  }
  return migrated
}

function validateOwnership(file: BackupFile): void {
  Object.entries(file.data).forEach(([collection, records]) => {
    records.forEach((record, index) => {
      if (record.ownerId !== file.ownerId) {
        throw new BackupError(
          'BACKUP_INTEGRITY_ERROR',
          `data.${collection}.${index}.ownerId no coincide con el propietario del respaldo.`,
        )
      }
    })
  })
}

export class BackupService {
  constructor(
    private readonly dataSource: BackupDataSource,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async exportBackup(ownerId: string): Promise<BackupFile> {
    try {
      const data = await this.dataSource.readActive(ownerId)
      const file = backupFileSchema.parse({
        schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
        appName: APP_NAME,
        exportedAt: this.now(),
        ownerId,
        data,
      })
      validateOwnership(file)
      validateBackupIntegrity(file.data)
      return file
    } catch (reason) {
      if (reason instanceof BackupError) throw reason
      throw new BackupError(
        'BACKUP_EXPORT_ERROR',
        'No se pudo crear el respaldo.',
        { cause: reason },
      )
    }
  }

  serialize(file: BackupFile): string {
    return JSON.stringify(file, null, 2)
  }

  prepareImport(serialized: string): PreparedBackup {
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized) as unknown
    } catch (reason) {
      throw new BackupError(
        'INVALID_BACKUP_FILE',
        'El archivo no contiene JSON válido.',
        { cause: reason },
      )
    }

    const envelope = backupVersionEnvelopeSchema.safeParse(parsed)
    if (!envelope.success) {
      throw new BackupError(
        'INVALID_BACKUP_FILE',
        formatZodError(envelope.error),
      )
    }
    if (envelope.data.schemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
      throw new BackupError(
        'FUTURE_BACKUP_VERSION',
        `El respaldo usa la versión ${envelope.data.schemaVersion}. Actualiza ${APP_NAME} para importarlo.`,
      )
    }
    if (envelope.data.schemaVersion < 1) {
      throw new BackupError(
        'UNSUPPORTED_BACKUP_VERSION',
        'La versión del respaldo no es compatible.',
      )
    }

    const migrated = migrateBackup(parsed, envelope.data.schemaVersion)
    const result = backupFileSchema.safeParse(migrated)
    if (!result.success) {
      throw new BackupError('INVALID_BACKUP_FILE', formatZodError(result.error))
    }
    const file = result.data
    validateOwnership(file)
    validateBackupIntegrity(file.data)
    const counts = Object.fromEntries(
      Object.entries(file.data).map(([key, records]) => [key, records.length]),
    ) as Record<keyof BackupData, number>
    return {
      file,
      summary: {
        schemaVersion: file.schemaVersion,
        exportedAt: file.exportedAt,
        counts,
      },
    }
  }

  async importBackup(ownerId: string, file: BackupFile): Promise<void> {
    try {
      const validated = backupFileSchema.parse(file)
      validateOwnership(validated)
      validateBackupIntegrity(validated.data)
      await this.dataSource.replace(ownerId, validated.data)
    } catch (reason) {
      if (reason instanceof BackupError) throw reason
      if (reason instanceof z.ZodError) {
        throw new BackupError('INVALID_BACKUP_FILE', formatZodError(reason), {
          cause: reason,
        })
      }
      throw new BackupError(
        'BACKUP_IMPORT_ERROR',
        'No se pudo reemplazar la información local.',
        { cause: reason },
      )
    }
  }
}
