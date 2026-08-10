import { act, renderHook } from '@testing-library/react'
import type {
  CalculatedCategoryChange,
  CategoryChangeExplanation,
} from '@domain/ports'
import {
  useCategoryChangeExplanations,
  type ExplainCategoryChangesAction,
} from './useCategoryChangeExplanations'

const changes: ReadonlyArray<CalculatedCategoryChange> = [
  {
    categoryId: 'a',
    categoryName: 'Comida',
    currentAmount: 15_000,
    previousAmount: 10_000,
    absoluteChange: 5_000,
    changePercentage: 50,
  },
  {
    categoryId: 'b',
    categoryName: 'Transporte',
    currentAmount: 8_000,
    previousAmount: 10_000,
    absoluteChange: -2_000,
    changePercentage: -20,
  },
]

function setup(
  overrides: Partial<Parameters<typeof useCategoryChangeExplanations>[0]> = {},
) {
  return {
    action: {
      execute: vi.fn(
        async (): Promise<ReadonlyArray<CategoryChangeExplanation>> => [
          { categoryId: 'b', explanation: 'Bajó' },
          { categoryId: 'a', explanation: 'Subió' },
        ],
      ),
    } satisfies ExplainCategoryChangesAction,
    changes,
    enabled: true,
    identityKey: 'user-a',
    comparisonKey: 'current:previous',
    ...overrides,
  }
}

describe('useCategoryChangeExplanations', () => {
  it('49-50. asocia por categoryId sin depender del orden', async () => {
    const props = setup()
    const { result } = renderHook(() => useCategoryChangeExplanations(props))
    await act(() => result.current.generate())
    expect(result.current.explanations.get('a')).toBe('Subió')
    expect(result.current.explanations.get('b')).toBe('Bajó')
  })

  it('51-52. descarta ID desconocido y conserva una sola respuesta duplicada', async () => {
    const props = setup({
      action: {
        execute: vi.fn(async () => [
          { categoryId: 'unknown', explanation: 'No' },
          { categoryId: 'a', explanation: 'Primera' },
          { categoryId: 'a', explanation: 'Segunda' },
        ]),
      },
    })
    const { result } = renderHook(() => useCategoryChangeExplanations(props))
    await act(() => result.current.generate())
    expect([...result.current.explanations]).toEqual([['a', 'Primera']])
  })

  it('53-55, 58-60, 62-66. falta o error no altera ni oculta cifras locales', async () => {
    const props = setup({
      action: {
        execute: vi.fn(async () =>
          Promise.reject({
            code: 'invalid_response',
            details: '{secret-json}',
            stack: 'private-stack',
          }),
        ),
      },
    })
    const original = structuredClone(changes)
    const { result } = renderHook(() => useCategoryChangeExplanations(props))
    await act(() => result.current.generate())
    expect(result.current.status).toBe('error')
    expect(result.current.message).not.toMatch(/secret-json|private-stack/)
    expect(changes).toEqual(original)
    expect(result.current.explanations.size).toBe(0)
  })

  it('56-57. cambiar comparación invalida e ignora respuesta tardía', async () => {
    let resolve:
      ((value: ReadonlyArray<CategoryChangeExplanation>) => void) | undefined
    const props = setup({
      action: {
        execute: vi.fn(
          () =>
            new Promise<ReadonlyArray<CategoryChangeExplanation>>((next) => {
              resolve = next
            }),
        ),
      },
    })
    const { result, rerender } = renderHook(
      ({ comparisonKey }) =>
        useCategoryChangeExplanations({ ...props, comparisonKey }),
      { initialProps: { comparisonKey: 'a:b' } },
    )
    act(() => {
      void result.current.generate()
    })
    rerender({ comparisonKey: 'a:c' })
    await act(async () =>
      resolve?.([{ categoryId: 'a', explanation: 'Vieja' }]),
    )
    expect(result.current.explanations.size).toBe(0)
    expect(result.current.status).toBe('idle')
  })

  it('92-93. cambio de usuario y desmontaje no mezclan resultados', async () => {
    let resolve:
      ((value: ReadonlyArray<CategoryChangeExplanation>) => void) | undefined
    const props = setup({
      action: {
        execute: vi.fn(
          () =>
            new Promise<ReadonlyArray<CategoryChangeExplanation>>((next) => {
              resolve = next
            }),
        ),
      },
    })
    const { result, rerender, unmount } = renderHook(
      ({ identityKey }) =>
        useCategoryChangeExplanations({ ...props, identityKey }),
      { initialProps: { identityKey: 'user-a' } },
    )
    act(() => {
      void result.current.generate()
    })
    rerender({ identityKey: 'user-b' })
    expect(result.current.explanations.size).toBe(0)
    unmount()
    await act(async () =>
      resolve?.([{ categoryId: 'a', explanation: 'Vieja' }]),
    )
  })
})
