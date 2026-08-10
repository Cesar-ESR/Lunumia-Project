import { act, cleanup, renderHook } from '@testing-library/react'
import fc from 'fast-check'
import type { Category } from '@domain/entities'
import { AIInsightsError } from '@infrastructure/ai'
import {
  useCategorySuggestion,
  type SuggestExpenseCategoryAction,
} from './useCategorySuggestion'

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const categoryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const category: Category = {
  id: categoryId,
  ownerId,
  name: 'Comida',
  normalizedName: 'comida',
  color: '#123456',
  icon: null,
  isSystem: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
}

function action(
  result: { categoryId: string; confidence: number } | null = null,
) {
  return {
    execute: vi.fn(async () => result),
  } satisfies SuggestExpenseCategoryAction
}

function props(
  overrides: Partial<Parameters<typeof useCategorySuggestion>[0]> = {},
) {
  return {
    action: action({ categoryId, confidence: 0.8 }),
    enabled: true,
    identityKey: ownerId,
    ownerId,
    description: 'Supermercado',
    categories: [category],
    ...overrides,
  }
}

async function advanceDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(500)
    await Promise.resolve()
  })
}

describe('useCategorySuggestion', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('1. no llama IA con descripción vacía', async () => {
    const setup = props({ description: ' ' })
    renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(setup.action!.execute).not.toHaveBeenCalled()
  })

  it('2. no llama IA bajo la longitud mínima', async () => {
    const setup = props({ description: 'ab' })
    renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(setup.action!.execute).not.toHaveBeenCalled()
  })

  it('3. guest no llama IA', async () => {
    const setup = props({ ownerId: 'guest:test', identityKey: 'guest:test' })
    renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(setup.action!.execute).not.toHaveBeenCalled()
  })

  it('4. usuario sin sesión no llama IA', async () => {
    const setup = props({ enabled: false })
    renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(setup.action!.execute).not.toHaveBeenCalled()
  })

  it('5. usuario autenticado puede solicitar sugerencia', async () => {
    const setup = props()
    renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(setup.action!.execute).toHaveBeenCalledOnce()
  })

  it('6. debounce evita una llamada por pulsación', async () => {
    const setup = props({ description: 'Sup' })
    const { rerender } = renderHook(
      ({ description }) => useCategorySuggestion({ ...setup, description }),
      { initialProps: { description: 'Sup' } },
    )
    rerender({ description: 'Super' })
    rerender({ description: 'Supermercado' })
    expect(setup.action!.execute).not.toHaveBeenCalled()
    await advanceDebounce()
    expect(setup.action!.execute).toHaveBeenCalledOnce()
  })

  it('Feature: gasto-claro-app, Property AI-7: una ráfaga bajo el debounce produce una sola solicitud vigente', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^[a-z]{3,30}$/), {
          minLength: 1,
          maxLength: 12,
        }),
        fc.array(fc.integer({ min: 0, max: 499 }), {
          minLength: 1,
          maxLength: 12,
        }),
        async (descriptions, intervals) => {
          const setup = props({ description: descriptions[0] })
          const { rerender, unmount } = renderHook(
            ({ description }) =>
              useCategorySuggestion({ ...setup, description }),
            { initialProps: { description: descriptions[0] ?? 'abc' } },
          )
          for (let index = 1; index < descriptions.length; index += 1) {
            await act(async () => {
              vi.advanceTimersByTime(intervals[index % intervals.length] ?? 0)
            })
            rerender({ description: descriptions[index] ?? 'abc' })
          }
          expect(setup.action!.execute).not.toHaveBeenCalled()
          await advanceDebounce()
          expect(setup.action!.execute).toHaveBeenCalledTimes(1)
          expect(setup.action!.execute).toHaveBeenLastCalledWith(
            descriptions.at(-1)?.trim(),
            [category],
            ownerId,
          )
          unmount()
          expect(vi.getTimerCount()).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('7. realiza una llamada tras el debounce', async () => {
    const setup = props()
    renderHook(() => useCategorySuggestion(setup))
    vi.advanceTimersByTime(499)
    expect(setup.action!.execute).not.toHaveBeenCalled()
    await advanceDebounce()
    expect(setup.action!.execute).toHaveBeenCalledOnce()
  })

  it('8. cambiar descripción cancela el timer anterior', async () => {
    const setup = props()
    const { rerender } = renderHook(
      ({ description }) => useCategorySuggestion({ ...setup, description }),
      { initialProps: { description: 'Supermercado' } },
    )
    vi.advanceTimersByTime(300)
    rerender({ description: 'Gasolina' })
    await advanceDebounce()
    expect(setup.action!.execute).toHaveBeenCalledOnce()
    expect(setup.action!.execute).toHaveBeenCalledWith(
      'Gasolina',
      [category],
      ownerId,
    )
  })

  it('9. no muestra una respuesta obsoleta', async () => {
    let resolveFirst:
      ((value: { categoryId: string; confidence: number }) => void) | undefined
    let resolveSecond:
      ((value: { categoryId: string; confidence: number }) => void) | undefined
    const customAction: SuggestExpenseCategoryAction = {
      execute: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecond = resolve
            }),
        ),
    }
    const setup = props({ action: customAction })
    const { result, rerender } = renderHook(
      ({ description }) => useCategorySuggestion({ ...setup, description }),
      { initialProps: { description: 'Supermercado' } },
    )
    await advanceDebounce()
    rerender({ description: 'Gasolina' })
    await advanceDebounce()
    await act(async () => resolveFirst?.({ categoryId, confidence: 0.8 }))
    expect(result.current.state.status).toBe('loading')
    await act(async () => resolveSecond?.({ categoryId, confidence: 0.7 }))
    expect(result.current.state.status).toBe('suggestion')
  })

  it('10. muestra una categoría válida como sugerencia', async () => {
    const setup = props()
    const { result } = renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(result.current.state).toMatchObject({
      status: 'suggestion',
      suggestion: { categoryId },
    })
  })

  it('11. descarta una categoría inexistente', async () => {
    const setup = props({
      action: action({
        categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        confidence: 0.8,
      }),
    })
    const { result } = renderHook(() => useCategorySuggestion(setup))
    await advanceDebounce()
    expect(result.current.state.status).toBe('no_suggestion')
  })

  it('12. descarta una categoría eliminada', async () => {
    const setup = props()
    const { result, rerender } = renderHook(
      ({ categories }) => useCategorySuggestion({ ...setup, categories }),
      { initialProps: { categories: [category] } },
    )
    await advanceDebounce()
    expect(result.current.state.status).toBe('suggestion')
    rerender({
      categories: [{ ...category, deletedAt: '2026-08-02T00:00:00.000Z' }],
    })
    expect(result.current.state.status).toBe('idle')
  })

  it('17. una solicitud idéntica no se duplica durante el debounce', async () => {
    const setup = props()
    const { rerender } = renderHook(() => useCategorySuggestion(setup))
    rerender()
    rerender()
    await advanceDebounce()
    expect(setup.action!.execute).toHaveBeenCalledOnce()
  })

  it('20. cambiar usuario limpia la sugerencia', async () => {
    const setup = props()
    const { result, rerender } = renderHook(
      ({ identityKey }) => useCategorySuggestion({ ...setup, identityKey }),
      { initialProps: { identityKey: ownerId } },
    )
    await advanceDebounce()
    expect(result.current.state.status).toBe('suggestion')
    rerender({ identityKey: 'other-user' })
    expect(result.current.state.status).toBe('waiting')
  })

  it('21. desmontar cancela el debounce', async () => {
    const setup = props()
    const { unmount } = renderHook(() => useCategorySuggestion(setup))
    unmount()
    await advanceDebounce()
    expect(setup.action!.execute).not.toHaveBeenCalled()
  })

  it('22. no deja timers abiertos', () => {
    const setup = props()
    const { unmount } = renderHook(() => useCategorySuggestion(setup))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rate limit visual se limpia en logout y no se hereda por otro usuario', async () => {
    const otherOwnerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const otherCategory = {
      ...category,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ownerId: otherOwnerId,
    }
    const customAction: SuggestExpenseCategoryAction = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(
          new AIInsightsError('rate_limited', { retryAfterSeconds: 60 }),
        )
        .mockResolvedValueOnce({
          categoryId: otherCategory.id,
          confidence: 0.8,
        }),
    }
    const { result, rerender } = renderHook(
      (properties) => useCategorySuggestion(properties),
      {
        initialProps: props({ action: customAction, now: () => 1_000 }),
      },
    )
    await advanceDebounce()
    expect(result.current.state.status).toBe('rate_limited')

    rerender(
      props({
        action: customAction,
        enabled: false,
        identityKey: 'logged-out',
        now: () => 1_000,
      }),
    )
    expect(result.current.state.status).toBe('idle')
    rerender(
      props({
        action: customAction,
        identityKey: otherOwnerId,
        ownerId: otherOwnerId,
        categories: [otherCategory],
        now: () => 1_000,
      }),
    )
    expect(result.current.state.status).toBe('waiting')
    await advanceDebounce()
    expect(result.current.state.status).toBe('suggestion')
    expect(customAction.execute).toHaveBeenCalledTimes(2)
  })
})
