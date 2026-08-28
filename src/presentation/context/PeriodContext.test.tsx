import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SyncOrchestrator,
  SyncState,
} from '@application/services/SyncOrchestrator'
import { ApplicationServicesProvider } from './ApplicationServicesContext'
import { PeriodProvider, usePeriod } from './PeriodContext'
import { SyncProvider } from './SyncContext'
import { useAuth } from './AuthContext'
import {
  createApplicationServicesMock,
  createPeriodMock,
} from '../test/test-factories'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))

const ownerId = '11111111-1111-4111-8111-111111111111'
const firstSuccess = '2026-08-27T12:00:00.000Z'

class FakeOrchestrator {
  state: SyncState = {
    status: 'syncing',
    ownerId,
    pendingCount: 0,
    isOnline: true,
    isSyncing: true,
    lastAttemptAt: '2026-08-27T11:59:59.000Z',
    lastSuccessfulSyncAt: null,
    nextRetryAt: null,
    retryCount: 0,
    error: null,
    lastResult: null,
    canRetryManually: false,
  }
  readonly start = vi.fn()
  readonly stop = vi.fn()
  readonly pause = vi.fn()
  readonly resume = vi.fn()
  readonly syncNow = vi.fn().mockResolvedValue(null)
  private readonly listeners = new Set<(state: SyncState) => void>()
  getState = () => this.state
  subscribe = (listener: (state: SyncState) => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(state: SyncState) {
    this.state = state
    this.listeners.forEach((listener) => listener(state))
  }
}

function Consumer() {
  const period = usePeriod()
  return (
    <span>
      {period.isLoading
        ? 'loading'
        : `${period.periods.length}:${period.activePeriod?.id ?? 'none'}`}
    </span>
  )
}

describe('PeriodProvider authenticated hydration refresh', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: ownerId },
      ownerId,
      status: 'authenticated',
      revalidateSession: vi.fn(),
    } as never)
  })

  it('refreshes hydrated repositories once per successful sync timestamp', async () => {
    const current = createPeriodMock({
      ownerId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    let repositoryPeriods = [] as ReturnType<typeof createPeriodMock>[]
    let activePeriodId: string | null = null
    const result = createApplicationServicesMock({ activePeriod: null })
    result.services.ownerId = ownerId
    vi.mocked(result.services.periods.listPeriods.execute).mockImplementation(
      async () => repositoryPeriods,
    )
    vi.mocked(
      result.services.settings.getUserSettings.execute,
    ).mockImplementation(async () => ({
      id: 'settings',
      ownerId,
      activePeriodId,
      currency: 'MXN',
      theme: 'system',
      createdAt: firstSuccess,
      updatedAt: firstSuccess,
    }))
    const orchestrator = new FakeOrchestrator()
    render(
      <ApplicationServicesProvider services={result.services}>
        <SyncProvider
          orchestrator={orchestrator as unknown as SyncOrchestrator}
        >
          <PeriodProvider>
            <Consumer />
          </PeriodProvider>
        </SyncProvider>
      </ApplicationServicesProvider>,
    )

    await waitFor(() =>
      expect(result.services.periods.listPeriods.execute).toHaveBeenCalledTimes(
        1,
      ),
    )
    repositoryPeriods = [current]
    activePeriodId = current.id
    act(() =>
      orchestrator.emit({
        ...orchestrator.state,
        status: 'up_to_date',
        isSyncing: false,
        lastSuccessfulSyncAt: firstSuccess,
      }),
    )

    expect(await screen.findByText(`1:${current.id}`)).toBeInTheDocument()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).not.toHaveBeenCalled()
    expect(result.services.periods.listPeriods.execute).toHaveBeenCalledTimes(2)

    act(() => orchestrator.emit({ ...orchestrator.state }))
    await Promise.resolve()
    expect(result.services.periods.listPeriods.execute).toHaveBeenCalledTimes(2)

    act(() =>
      orchestrator.emit({
        ...orchestrator.state,
        lastSuccessfulSyncAt: '2026-08-27T13:00:00.000Z',
      }),
    )
    await waitFor(() =>
      expect(result.services.periods.listPeriods.execute).toHaveBeenCalledTimes(
        3,
      ),
    )
  })

  it('selects a hydrated current period only once when settings have no selection', async () => {
    const current = createPeriodMock({
      ownerId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    let repositoryPeriods = [] as ReturnType<typeof createPeriodMock>[]
    const result = createApplicationServicesMock({ activePeriod: null })
    result.services.ownerId = ownerId
    vi.mocked(result.services.periods.listPeriods.execute).mockImplementation(
      async () => repositoryPeriods,
    )
    const orchestrator = new FakeOrchestrator()
    render(
      <ApplicationServicesProvider services={result.services}>
        <SyncProvider
          orchestrator={orchestrator as unknown as SyncOrchestrator}
        >
          <PeriodProvider>
            <Consumer />
          </PeriodProvider>
        </SyncProvider>
      </ApplicationServicesProvider>,
    )
    await screen.findByText('0:none')
    repositoryPeriods = [current]
    act(() =>
      orchestrator.emit({
        ...orchestrator.state,
        status: 'up_to_date',
        isSyncing: false,
        lastSuccessfulSyncAt: firstSuccess,
      }),
    )

    expect(await screen.findByText(`1:${current.id}`)).toBeInTheDocument()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).toHaveBeenCalledTimes(1)
    act(() => orchestrator.emit({ ...orchestrator.state }))
    await Promise.resolve()
    expect(
      result.services.periods.setActivePeriod.execute,
    ).toHaveBeenCalledTimes(1)
  })
})
