import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Period, UserSettings } from '@domain/entities'
import {
  buildPeriodOverlapPlan,
  planPeriodNavigation,
} from '@application/services/PeriodOverlapResolution'
import type { SyncContextValue } from '../context/SyncContext'
import { PeriodResolutionNotice } from './PeriodResolutionNotice'
import type { PeriodResolutionPreview } from '@application/services/PeriodResolutionPort'
import { SyncFailure } from '@application/services/SyncCoordinator'

function fixture() {
  const ownerId = '10000000-0000-4000-8000-000000000001'
  const legacy: Period = {
    id: 'legacy',
    ownerId,
    type: 'monthly',
    startDate: '2026-07-31',
    endDate: '2026-08-31',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
    syncStatus: 'pending',
  }
  const july = {
    ...legacy,
    id: 'july',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  }
  const august = { ...legacy, id: 'august', startDate: '2026-08-01' }
  const settings: UserSettings = {
    id: 'settings',
    ownerId,
    activePeriodId: 'august',
    currency: 'MXN',
    theme: 'system',
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  }
  const preview: PeriodResolutionPreview = {
    existingBudgets: [],
    operationId: 'operation',
    revision: 'revision',
    navigationPeriods: [july, august],
    plan: buildPeriodOverlapPlan(
      legacy,
      [july, august],
      [
        {
          id: 'income',
          ownerId,
          periodId: 'legacy',
          kind: 'income',
          date: '2026-07-31',
          deletedAt: null,
        },
      ],
    ),
    navigation: planPeriodNavigation(settings, settings, legacy.id, [
      july,
      august,
    ]),
  }
  const resolvePeriodOverlap = vi.fn().mockResolvedValue(undefined)
  const sync: SyncContextValue = {
    status: 'requiresPeriodResolution',
    ownerId,
    pendingCount: 5,
    isOnline: true,
    isSyncing: false,
    lastAttemptAt: null,
    lastSuccessfulSyncAt: null,
    nextRetryAt: null,
    retryCount: 0,
    error: null,
    canRetryManually: false,
    isAvailable: true,
    syncNow: vi.fn().mockResolvedValue(null),
    resolvePeriodOverlap,
    lastResult: {
      uploaded: 0,
      downloaded: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      startedAt: legacy.createdAt,
      finishedAt: legacy.updatedAt,
      errors: [],
      periodResolution: preview,
    },
  }
  return { sync, resolvePeriodOverlap, preview }
}

describe('PeriodResolutionNotice', () => {
  it('disables incomplete budgets natively, keeps choices keyboard reachable, and enables a complete plan', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap, preview } = fixture()
    preview.plan = buildPeriodOverlapPlan(
      preview.plan.localPeriod,
      preview.navigationPeriods,
      [
        {
          id: 'budget',
          ownerId: preview.plan.localPeriod.ownerId,
          periodId: 'legacy',
          kind: 'categoryBudget',
          categoryId: 'food',
          date: null,
          deletedAt: null,
        },
      ],
    )
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    const apply = screen.getByRole('button', { name: 'Aplicar resolución' })
    expect(apply).toBeDisabled()
    expect(
      screen.getByText('Selecciona un periodo válido para cada presupuesto.'),
    ).toBeVisible()
    await user.click(apply)
    expect(resolvePeriodOverlap).not.toHaveBeenCalled()
    await user.tab()
    const select = screen.getByRole('combobox', {
      name: 'Destino del presupuesto food',
    })
    expect(select).toHaveFocus()
    await user.selectOptions(select, 'august')
    expect(apply).toBeEnabled()
    await user.click(apply)
    expect(resolvePeriodOverlap).toHaveBeenCalledTimes(1)
  })

  it('uses canonical collision validation and enables an alternative destination', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap, preview } = fixture()
    preview.plan = buildPeriodOverlapPlan(
      preview.plan.localPeriod,
      preview.navigationPeriods,
      [
        {
          id: 'budget',
          ownerId: preview.plan.localPeriod.ownerId,
          periodId: 'legacy',
          kind: 'categoryBudget',
          categoryId: 'food',
          date: null,
          deletedAt: null,
        },
      ],
    )
    preview.existingBudgets = [
      {
        id: 'existing',
        ownerId: preview.plan.localPeriod.ownerId,
        periodId: 'august',
        categoryId: 'food',
        deletedAt: null,
      },
    ]
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    await user.selectOptions(screen.getByRole('combobox'), 'august')
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Ya existe un presupuesto activo en el destino.'),
    ).toBeVisible()
    expect(resolvePeriodOverlap).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByRole('combobox'), 'july')
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toBeEnabled()
  })

  it('disables a dated dependency without a destination', async () => {
    const user = userEvent.setup()
    const { sync, preview } = fixture()
    preview.plan = buildPeriodOverlapPlan(
      preview.plan.localPeriod,
      preview.navigationPeriods,
      [
        {
          id: 'income',
          ownerId: preview.plan.localPeriod.ownerId,
          periodId: 'legacy',
          kind: 'income',
          date: '2026-09-01',
          deletedAt: null,
        },
      ],
    )
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Una fecha no tiene un periodo de destino válido.'),
    ).toBeVisible()
  })

  it('keeps apply disabled during the pending promise and prevents duplicate calls', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap } = fixture()
    let finish!: () => void
    resolvePeriodOverlap.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar resolución' }))
    const pending = screen.getByRole('button', { name: 'Procesando…' })
    expect(pending).toBeDisabled()
    await user.click(pending)
    expect(resolvePeriodOverlap).toHaveBeenCalledTimes(1)
    await act(async () => finish())
  })

  it('allows retry after a recognized transient network failure on a valid plan', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap } = fixture()
    resolvePeriodOverlap.mockRejectedValueOnce(
      new SyncFailure('network', 'Sin conexión', null, true),
    )
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar resolución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toBeEnabled()
  })
  it('opens an accessible preview, traps focus, cancels with Escape and restores focus without applying', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap } = fixture()
    render(<PeriodResolutionNotice sync={sync} />)
    const trigger = screen.getByRole('button', { name: 'Resolver conflicto' })
    await user.click(trigger)
    expect(
      screen.getByRole('dialog', { name: 'Resolver conflicto de periodos' }),
    ).toHaveAccessibleDescription(/Un periodo guardado/)
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(resolvePeriodOverlap).not.toHaveBeenCalled()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(resolvePeriodOverlap).not.toHaveBeenCalled()
  })

  it('confirms the displayed revision exactly once without a manual navigation choice', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap } = fixture()
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aplicar resolución' }))
    expect(resolvePeriodOverlap).toHaveBeenCalledExactlyOnceWith('operation', {
      revision: 'revision',
      destinations: {},
      selectedPeriodId: undefined,
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('announces stale apply errors and leaves the conflict available', async () => {
    const user = userEvent.setup()
    const { sync, resolvePeriodOverlap } = fixture()
    resolvePeriodOverlap.mockRejectedValue(new Error('Recalcula el conflicto.'))
    render(<PeriodResolutionNotice sync={sync} />)
    await user.click(screen.getByRole('button', { name: 'Resolver conflicto' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar resolución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Recalcula el conflicto.',
    )
    expect(
      screen.getByRole('button', { name: 'Aplicar resolución' }),
    ).toBeDisabled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
