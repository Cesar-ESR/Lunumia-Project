import { describe, expect, it, vi } from 'vitest'
import type { BackupDataSource } from './BackupDataSource'
import { BackupError } from './BackupErrors'
import { BackupService } from './BackupService'
import {
  BACKUP_NOW,
  CATEGORY_ID,
  createBackupData,
  createBackupFile,
  createLegacyBackupFileV1,
} from '../../../tests/backup-fixtures'

function createSource(data = createBackupData()): BackupDataSource {
  return {
    readActive: vi.fn().mockResolvedValue(data),
    replace: vi.fn().mockResolvedValue(undefined),
  }
}

describe('BackupService', () => {
  it('exporta un archivo actual, validado y serializado de forma legible', async () => {
    const service = new BackupService(createSource(), () => BACKUP_NOW)
    const file = await service.exportBackup('guest:source')
    expect(file).toMatchObject({
      schemaVersion: 2,
      appName: 'Lunumia',
      exportedAt: BACKUP_NOW,
      ownerId: 'guest:source',
    })
    expect(service.serialize(file)).toContain('\n  "schemaVersion": 2')
  })

  it('valida sin recortar los textos persistidos del respaldo', async () => {
    const data = createBackupData()
    data.incomes[0] = {
      ...data.incomes[0]!,
      description: '  Ingreso con espacios  ',
    }
    data.expenses[0] = {
      ...data.expenses[0]!,
      description: '  Gasto con espacios  ',
    }
    data.categories[0] = {
      ...data.categories[0]!,
      name: '  Servicios  ',
      normalizedName: 'servicios',
      icon: '  herramienta  ',
    }
    data.recurringPayments[0] = {
      ...data.recurringPayments[0]!,
      name: '  Internet  ',
    }
    const service = new BackupService(createSource(data), () => BACKUP_NOW)

    const exported = await service.exportBackup('guest:source')
    const restored = service.prepareImport(service.serialize(exported)).file
      .data

    expect(restored.incomes[0]?.description).toBe('  Ingreso con espacios  ')
    expect(restored.expenses[0]?.description).toBe('  Gasto con espacios  ')
    expect(restored.categories[0]).toMatchObject({
      name: '  Servicios  ',
      icon: '  herramienta  ',
    })
    expect(restored.recurringPayments[0]?.name).toBe('  Internet  ')
  })

  it('rechaza JSON malformado y archivos de otra aplicación', () => {
    const service = new BackupService(createSource())
    expect(() => service.prepareImport('{')).toThrow('JSON válido')
    expect(() =>
      service.prepareImport(
        JSON.stringify({ ...createBackupFile(), appName: 'OtraApp' }),
      ),
    ).toThrow('appName')
  })

  it('migra respaldos v1 de GastoClaro de forma determinista', () => {
    const service = new BackupService(createSource())
    const legacy = { ...createLegacyBackupFileV1(), appName: 'GastoClaro' }

    const prepared = service.prepareImport(JSON.stringify(legacy))

    expect(prepared.file.appName).toBe('GastoClaro')
    expect(prepared.file.schemaVersion).toBe(2)
    expect(prepared.file.data.incomes[0]).toMatchObject({
      status: 'received',
      affectsBalance: true,
      balanceEffectiveAt: BACKUP_NOW,
    })
    expect(prepared.file.data.expenses[0]).toMatchObject({
      affectsBalance: true,
      balanceEffectiveAt: BACKUP_NOW,
    })
    expect(prepared.file.data.recurringPaymentOccurrences[0]?.amount).toBe(
      legacy.data.recurringPayments[0]?.amount,
    )
    expect(prepared.file.data.balanceAnchors).toEqual([])
    expect(service.prepareImport(JSON.stringify(legacy)).file).toEqual(
      prepared.file,
    )
  })

  it('falla explícitamente si una occurrence v1 no tiene parent', () => {
    const source = createSource()
    const service = new BackupService(source)
    const legacy = createLegacyBackupFileV1()
    legacy.data.recurringPayments = []

    expect(() => service.prepareImport(JSON.stringify(legacy))).toThrowError(
      expect.objectContaining({
        code: 'BACKUP_INTEGRITY_ERROR',
        message: expect.stringContaining('no puede migrarse'),
      }),
    )
    expect(source.replace).not.toHaveBeenCalled()
  })

  it('no aplica defaults legacy a un backup v2 corrupto', () => {
    const service = new BackupService(createSource())
    const missingStatus = structuredClone(createBackupFile()) as unknown as {
      data: { incomes: Array<Record<string, unknown>> }
    }
    delete missingStatus.data.incomes[0]?.status
    expect(() => service.prepareImport(JSON.stringify(missingStatus))).toThrow(
      'status',
    )

    const missingAmount = structuredClone(createBackupFile()) as unknown as {
      data: { recurringPaymentOccurrences: Array<Record<string, unknown>> }
    }
    delete missingAmount.data.recurringPaymentOccurrences[0]?.amount
    expect(() => service.prepareImport(JSON.stringify(missingAmount))).toThrow(
      'amount',
    )
  })

  it('preserva el amount snapshot actual aunque difiera de la regla', () => {
    const service = new BackupService(createSource())
    const file = createBackupFile()
    file.data.recurringPayments[0]!.amount = 9_000
    file.data.recurringPaymentOccurrences[0]!.amount = 5_000

    const prepared = service.prepareImport(JSON.stringify(file))

    expect(prepared.file.data.recurringPayments[0]?.amount).toBe(9_000)
    expect(prepared.file.data.recurringPaymentOccurrences[0]?.amount).toBe(
      5_000,
    )
  })

  it('rechaza una versión futura con instrucción de actualización', () => {
    const service = new BackupService(createSource())
    expect(() =>
      service.prepareImport(
        JSON.stringify({ ...createBackupFile(), schemaVersion: 99 }),
      ),
    ).toThrow('Actualiza Lunumia')
  })

  it('rechaza versión ausente o de tipo inválido', () => {
    const service = new BackupService(createSource())
    const { schemaVersion, ...withoutVersion } = createBackupFile()
    void schemaVersion

    expect(() => service.prepareImport(JSON.stringify(withoutVersion))).toThrow(
      'schemaVersion',
    )
    expect(() =>
      service.prepareImport(
        JSON.stringify({ ...createBackupFile(), schemaVersion: '2' }),
      ),
    ).toThrow('schemaVersion')
  })

  it('no inventa migraciones para versiones históricas inexistentes', () => {
    const service = new BackupService(createSource())
    expect(() =>
      service.prepareImport(
        JSON.stringify({ ...createBackupFile(), schemaVersion: 0 }),
      ),
    ).toThrow('versión del respaldo no es compatible')
  })

  it('rechaza referencias rotas antes de invocar la escritura', async () => {
    const source = createSource()
    const service = new BackupService(source)
    const file = createBackupFile()
    file.data.recurringPayments[0] = {
      ...file.data.recurringPayments[0]!,
      categoryId: '99999999-9999-4999-8999-999999999999',
    }
    expect(() => service.prepareImport(JSON.stringify(file))).toThrow(
      'data.recurringPayments.0.categoryId',
    )
    expect(source.replace).not.toHaveBeenCalled()
  })

  it('valida relaciones recíprocas entre pago, ocurrencia y gasto', () => {
    const service = new BackupService(createSource())
    const file = createBackupFile()
    file.data.expenses[0] = {
      ...file.data.expenses[0]!,
      recurringOccurrenceId: null,
    }
    expect(() => service.prepareImport(JSON.stringify(file))).toThrow(
      'vínculo recíproco',
    )
  })

  it('rechaza IDs duplicados de BalanceAnchor', () => {
    const service = new BackupService(createSource())
    const file = createBackupFile()
    file.data.balanceAnchors.push({ ...file.data.balanceAnchors[0]! })

    expect(() => service.prepareImport(JSON.stringify(file))).toThrow(
      'data.balanceAnchors.1',
    )
  })

  it('entrega el resumen e importa solo después de una preparación válida', async () => {
    const source = createSource()
    const service = new BackupService(source)
    const prepared = service.prepareImport(JSON.stringify(createBackupFile()))
    expect(prepared.summary.counts.expenses).toBe(1)
    expect(prepared.summary.counts.balanceAnchors).toBe(1)
    expect(prepared.file.data.categories[0]?.id).toBe(CATEGORY_ID)
    await service.importBackup('guest:destination', prepared.file)
    expect(source.replace).toHaveBeenCalledWith(
      'guest:destination',
      prepared.file.data,
    )
  })

  it('expone errores de persistencia como error tipado de importación', async () => {
    const source = createSource()
    vi.mocked(source.replace).mockRejectedValueOnce(new Error('disk failure'))
    const service = new BackupService(source)
    await expect(
      service.importBackup('guest:destination', createBackupFile()),
    ).rejects.toMatchObject({
      code: 'BACKUP_IMPORT_ERROR',
    } satisfies Partial<BackupError>)
  })
})
