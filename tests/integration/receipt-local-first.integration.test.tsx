import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateExpense } from '@application/use-cases/expenses/CreateExpense'
import type { Category, Period } from '@domain/entities'
import { GastoClaroDB } from '@infrastructure/local/database'
import {
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexiePeriodRepository,
} from '@infrastructure/local/repositories'
import { ReceiptCaptureFlow } from '@presentation/pages/Receipts/ReceiptCaptureFlow'
import type { ApplicationServices } from '../../src/app/composition-root'

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const periodId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const categoryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const expenseId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const operationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const now = '2026-08-02T12:00:00.000Z'

const period: Period = {
  id: periodId,
  ownerId,
  type: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  syncStatus: 'synced',
}

const category: Category = {
  id: categoryId,
  ownerId,
  name: 'Comida',
  normalizedName: 'comida',
  color: '#156f67',
  icon: null,
  isSystem: false,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  syncStatus: 'synced',
}

let db: GastoClaroDB

beforeEach(async () => {
  db = new GastoClaroDB('receipt-local-first-integration')
  await db.open()
  await db.periods.add(period)
  await db.categories.add(category)
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(async () => {
  cleanup()
  await db.delete()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Receipt local-first integration', () => {
  it('confirma una vez: persiste un Expense y una SyncOperation sin imagen ni red', async () => {
    const fetchGuard = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected network call'))
    const cachePut = vi.fn()
    const cacheOpen = vi.fn(async () => ({ put: cachePut }))
    vi.stubGlobal('caches', { open: cacheOpen })
    const syncDependencies = {
      ids: { generate: vi.fn(() => operationId) },
      clock: { now: () => now },
    }
    const createExpense = new CreateExpense(
      new DexieExpenseRepository(db, ownerId, syncDependencies),
      new DexiePeriodRepository(db, ownerId, syncDependencies),
      new DexieCategoryRepository(db, ownerId, syncDependencies),
      { generate: () => expenseId },
      { now: () => now },
    )
    const onCreated = vi.fn()
    const revokePreviewUrl = vi.fn()
    const sensitiveBase64 = 'private-receipt-base64'
    const prepareImage = vi.fn(async () => ({
      fileName: 'receipt.jpg',
      mimeType: 'image/jpeg' as const,
      originalSizeBytes: 100,
      originalWidth: 1200,
      originalHeight: 800,
      compressedWidth: 1200,
      compressedHeight: 800,
      base64: sensitiveBase64,
      previewUrl: 'blob:private-receipt',
      revokePreviewUrl,
    }))
    const recognizeReceipt = vi.fn(async () => ({
      draft: {
        description: 'Mercado local',
        amount: 12_345,
        date: '2026-08-02' as const,
        categoryId: '',
        periodId,
      },
      detectedCurrency: 'MXN',
      confidence: 0.98,
    }))
    render(
      <ReceiptCaptureFlow
        ownerId={ownerId}
        authStatus="authenticated"
        currency="MXN"
        categories={[category]}
        periods={[period]}
        activePeriodId={periodId}
        receiptServices={{
          prepareImage: { execute: prepareImage },
          recognizeReceipt: { execute: recognizeReceipt },
        }}
        createExpense={createExpense}
        onCreated={onCreated}
        onCancel={vi.fn()}
        onSignIn={vi.fn()}
        onManagePeriods={vi.fn()}
      />,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Elegir de galería' }))
    await user.click(
      await screen.findByRole('button', { name: 'Analizar recibo' }),
    )
    await screen.findByRole('heading', { name: 'Datos del gasto' })
    await user.selectOptions(screen.getByLabelText('Categoría'), categoryId)
    await user.dblClick(screen.getByRole('button', { name: 'Guardar gasto' }))

    await screen.findByText('Gasto guardado en este dispositivo.')
    const expenses = await db.expenses.toArray()
    const operations = await db.syncOperations.toArray()
    expect(expenses).toHaveLength(1)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      operationId,
      entityType: 'expense',
      entityId: expenseId,
      operationType: 'create',
    })
    expect(expenses[0]).not.toHaveProperty('image')
    expect(expenses[0]).not.toHaveProperty('base64')
    const persisted = JSON.stringify({ expenses, operations })
    expect(persisted).not.toMatch(/base64|blob:|rawText|confidence/i)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(cachePut).not.toHaveBeenCalled()
    expect(cacheOpen).not.toHaveBeenCalled()
    expect(fetchGuard).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledOnce()
    expect(recognizeReceipt).toHaveBeenCalledOnce()
    expect(revokePreviewUrl).toHaveBeenCalledOnce()
  })

  it('un fallo local no muestra éxito ni crea cola parcial', async () => {
    render(
      <ReceiptCaptureFlow
        ownerId={ownerId}
        authStatus="authenticated"
        currency="MXN"
        categories={[category]}
        periods={[period]}
        activePeriodId={periodId}
        receiptServices={{
          prepareImage: { execute: vi.fn(async () => null) },
          recognizeReceipt: { execute: vi.fn() },
        }}
        createExpense={{
          execute: vi.fn(async () => {
            throw new Error('private IndexedDB table detail')
          }),
        }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
        onSignIn={vi.fn()}
        onManagePeriods={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    )
    await user.type(screen.getByLabelText('Monto (MXN)'), '10.00')
    await user.type(screen.getByLabelText('Descripción'), 'Prueba')
    await user.selectOptions(screen.getByLabelText('Categoría'), categoryId)
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(
      await screen.findByText('No pudimos guardar el gasto.'),
    ).toBeVisible()
    expect(screen.queryByText(/IndexedDB|table detail/i)).toBeNull()
    expect(screen.queryByText('Gasto guardado en este dispositivo.')).toBeNull()
    expect(await db.expenses.count()).toBe(0)
    expect(await db.syncOperations.count()).toBe(0)
    expect(screen.getByLabelText('Descripción')).toHaveValue('Prueba')
  })

  it('guest guarda manualmente sin invocar OCR ni crear operación remota', async () => {
    const recognizeReceipt = vi.fn()
    const createExpense = vi
      .fn<ApplicationServices['expenses']['createExpense']['execute']>()
      .mockResolvedValue({
        id: expenseId,
        ownerId: 'guest:receipt-owner',
        periodId,
        categoryId,
        amount: 500,
        description: 'Manual',
        date: '2026-08-02',
        recurringOccurrenceId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      })
    render(
      <ReceiptCaptureFlow
        ownerId="guest:receipt-owner"
        authStatus="guest"
        currency="MXN"
        categories={[{ ...category, ownerId: 'guest:receipt-owner' }]}
        periods={[{ ...period, ownerId: 'guest:receipt-owner' }]}
        activePeriodId={periodId}
        receiptServices={{
          prepareImage: { execute: vi.fn(async () => null) },
          recognizeReceipt: { execute: recognizeReceipt },
        }}
        createExpense={{ execute: createExpense }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
        onSignIn={vi.fn()}
        onManagePeriods={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    )
    await user.type(screen.getByLabelText('Monto (MXN)'), '5.00')
    await user.type(screen.getByLabelText('Descripción'), 'Manual')
    await user.selectOptions(screen.getByLabelText('Categoría'), categoryId)
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    await screen.findByText('Gasto guardado en este dispositivo.')
    expect(createExpense).toHaveBeenCalledOnce()
    expect(recognizeReceipt).not.toHaveBeenCalled()
    expect(await db.syncOperations.count()).toBe(0)
  })
})
