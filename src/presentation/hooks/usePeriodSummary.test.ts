import { act, renderHook } from '@testing-library/react'
import type { PeriodAggregatedData, PeriodSummary } from '@domain/ports'
import {
  usePeriodSummary,
  type GeneratePeriodSummaryAction,
} from './usePeriodSummary'

const data: PeriodAggregatedData = {
  totalIncome: 100_000,
  totalExpenses: 40_000,
  categoryBreakdown: [
    {
      categoryId: 'cat',
      categoryName: 'Comida',
      total: 40_000,
      percentage: 100,
    },
  ],
  topExpenses: [{ description: 'Mercado', amount: 40_000 }],
  periodType: 'monthly',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
}
const summary: PeriodSummary = {
  text: 'Buen control',
  highlights: ['40% gastado'],
}

function action(result: PeriodSummary = summary): GeneratePeriodSummaryAction {
  return { execute: vi.fn(async () => result) }
}

function setup(
  overrides: Partial<Parameters<typeof usePeriodSummary>[0]> = {},
) {
  return {
    action: action(),
    data,
    enabled: true,
    identityKey: 'user-a',
    periodId: 'period-a',
    ...overrides,
  }
}

describe('usePeriodSummary', () => {
  it('24. no hay datos: no llama IA', async () => {
    const props = setup({ data: { ...data, totalIncome: 0, totalExpenses: 0 } })
    const { result } = renderHook(() => usePeriodSummary(props))
    await act(() => result.current.generate())
    expect(props.action!.execute).not.toHaveBeenCalled()
  })

  it('25. guest o sesión deshabilitada no llama IA', async () => {
    const props = setup({ enabled: false, identityKey: 'guest:a' })
    const { result } = renderHook(() => usePeriodSummary(props))
    await act(() => result.current.generate())
    expect(props.action!.execute).not.toHaveBeenCalled()
  })

  it('30. respuesta válida conserva text y highlights', async () => {
    const props = setup()
    const { result } = renderHook(() => usePeriodSummary(props))
    await act(() => result.current.generate())
    expect(result.current).toMatchObject({ status: 'success', summary })
  })

  it('32-33, 58-60. error conserva el resumen anterior y permite reintento', async () => {
    const execute = vi
      .fn<GeneratePeriodSummaryAction['execute']>()
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce({ code: 'network_error' })
      .mockResolvedValueOnce({ text: 'Nuevo', highlights: [] })
    const props = setup({ action: { execute } })
    const { result } = renderHook(() => usePeriodSummary(props))
    await act(() => result.current.generate())
    await act(() => result.current.generate())
    expect(result.current.summary).toEqual(summary)
    expect(result.current.status).toBe('error')
    await act(() => result.current.generate())
    expect(result.current.summary?.text).toBe('Nuevo')
  })

  it('34. doble clic genera una sola solicitud', async () => {
    let resolve: ((value: PeriodSummary) => void) | undefined
    const execute = vi.fn(
      () =>
        new Promise<PeriodSummary>((next) => {
          resolve = next
        }),
    )
    const props = setup({ action: { execute } })
    const { result } = renderHook(() => usePeriodSummary(props))
    act(() => {
      void result.current.generate()
      void result.current.generate()
    })
    expect(execute).toHaveBeenCalledOnce()
    await act(async () => resolve?.(summary))
  })

  it('35-36. cambiar periodo invalida e ignora la respuesta anterior', async () => {
    let resolve: ((value: PeriodSummary) => void) | undefined
    const props = setup({
      action: {
        execute: vi.fn(
          () =>
            new Promise<PeriodSummary>((next) => {
              resolve = next
            }),
        ),
      },
    })
    const { result, rerender } = renderHook(
      ({ periodId }) => usePeriodSummary({ ...props, periodId }),
      { initialProps: { periodId: 'period-a' } },
    )
    act(() => {
      void result.current.generate()
    })
    rerender({ periodId: 'period-b' })
    await act(async () => resolve?.(summary))
    expect(result.current).toMatchObject({ status: 'idle', summary: null })
  })

  it('37, 91-92. caché efímera no mezcla usuarios', async () => {
    const props = setup()
    const { result, rerender } = renderHook(
      ({ identityKey }) => usePeriodSummary({ ...props, identityKey }),
      { initialProps: { identityKey: 'user-a' } },
    )
    await act(() => result.current.generate())
    expect(result.current.summary).toEqual(summary)
    rerender({ identityKey: 'user-b' })
    expect(result.current.summary).toBeNull()
    rerender({ identityKey: 'user-a' })
    expect(result.current.summary).toBeNull()
  })

  it('38. cambiar datos invalida el resumen', async () => {
    const props = setup()
    const { result, rerender } = renderHook(
      ({ currentData }) => usePeriodSummary({ ...props, data: currentData }),
      { initialProps: { currentData: data } },
    )
    await act(() => result.current.generate())
    rerender({ currentData: { ...data, totalExpenses: 41_000 } })
    expect(result.current.summary).toBeNull()
  })

  it('61. rate limit no crea bucle ni reintento automático', async () => {
    let currentTime = 1_000
    const execute = vi.fn(async () =>
      Promise.reject({ code: 'rate_limited', retryAfterSeconds: 30 }),
    )
    const props = setup({ action: { execute }, now: () => currentTime })
    const { result } = renderHook(() => usePeriodSummary(props))
    await act(() => result.current.generate())
    expect(result.current.status).toBe('rate_limited')
    await act(() => result.current.generate())
    expect(execute).toHaveBeenCalledOnce()
    currentTime += 31_000
    await act(() => result.current.generate())
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('90, 93. desmontar ignora respuestas tardías', async () => {
    let resolve: ((value: PeriodSummary) => void) | undefined
    const props = setup({
      action: {
        execute: vi.fn(
          () =>
            new Promise<PeriodSummary>((next) => {
              resolve = next
            }),
        ),
      },
    })
    const { result, unmount } = renderHook(() => usePeriodSummary(props))
    act(() => {
      void result.current.generate()
    })
    unmount()
    await act(async () => resolve?.(summary))
  })
})
