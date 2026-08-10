import { describe, expect, it, vi } from 'vitest'
import type { BackupDataSource } from './BackupDataSource'
import { BackupError } from './BackupErrors'
import { BackupService } from './BackupService'
import {
  BACKUP_NOW,
  CATEGORY_ID,
  createBackupData,
  createBackupFile,
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
      schemaVersion: 1,
      appName: 'Lunumia',
      exportedAt: BACKUP_NOW,
      ownerId: 'guest:source',
    })
    expect(service.serialize(file)).toContain('\n  "schemaVersion": 1')
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

  it('acepta respaldos históricos de GastoClaro sin cambiar sus datos', () => {
    const service = new BackupService(createSource())
    const legacy = { ...createBackupFile(), appName: 'GastoClaro' }

    const prepared = service.prepareImport(JSON.stringify(legacy))

    expect(prepared.file.appName).toBe('GastoClaro')
    expect(prepared.file.data).toEqual(legacy.data)
  })

  it('rechaza una versión futura con instrucción de actualización', () => {
    const service = new BackupService(createSource())
    expect(() =>
      service.prepareImport(
        JSON.stringify({ ...createBackupFile(), schemaVersion: 99 }),
      ),
    ).toThrow('Actualiza Lunumia')
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

  it('entrega el resumen e importa solo después de una preparación válida', async () => {
    const source = createSource()
    const service = new BackupService(source)
    const prepared = service.prepareImport(JSON.stringify(createBackupFile()))
    expect(prepared.summary.counts.expenses).toBe(1)
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
