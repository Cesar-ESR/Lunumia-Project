import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SuggestExpenseCategoryAction } from '../hooks/useCategorySuggestion'
import { ExpenseForm, type ExpenseFormValue } from './ExpenseForm'
import {
  CATEGORY_ID,
  createCategoryMock,
  createPeriodMock,
} from '../test/test-factories'

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function renderAIForm(
  action: SuggestExpenseCategoryAction,
  onSubmit = vi.fn<(value: ExpenseFormValue) => Promise<void>>(
    async () => undefined,
  ),
) {
  render(
    <ExpenseForm
      ownerId={ownerId}
      period={createPeriodMock({ ownerId })}
      categories={[createCategoryMock({ ownerId })]}
      categorySuggestionAction={action}
      aiSuggestionEnabled
      aiIdentityKey={ownerId}
      onSubmit={onSubmit}
    />,
  )
  return { onSubmit }
}

async function showSuggestion(action: SuggestExpenseCategoryAction) {
  renderAIForm(action)
  fireEvent.change(screen.getByLabelText('Descripción'), {
    target: { value: 'Supermercado' },
  })
  await act(async () => {
    vi.advanceTimersByTime(500)
    await Promise.resolve()
  })
}

describe('ExpenseForm con sugerencia inteligente', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('13. no preselecciona automáticamente la categoría', async () => {
    await showSuggestion({
      execute: vi.fn(async () => ({
        categoryId: CATEGORY_ID,
        confidence: 0.8,
      })),
    })
    expect(screen.getByLabelText('Categoría')).toHaveValue('')
    expect(screen.getByText('Sugerencia: Comida')).toBeInTheDocument()
  })

  it('14. Usar categoría actualiza solo el formulario', async () => {
    const action = {
      execute: vi.fn(async () => ({
        categoryId: CATEGORY_ID,
        confidence: 0.8,
      })),
    }
    const onSubmit = vi.fn<(value: ExpenseFormValue) => Promise<void>>()
    renderAIForm(action, onSubmit)
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Supermercado' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Usar categoría' }))
    expect(screen.getByLabelText('Categoría')).toHaveValue(CATEGORY_ID)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('15. Ignorar no modifica la categoría', async () => {
    await showSuggestion({
      execute: vi.fn(async () => ({
        categoryId: CATEGORY_ID,
        confidence: 0.8,
      })),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    expect(screen.getByLabelText('Categoría')).toHaveValue('')
    expect(screen.queryByText('Sugerencia: Comida')).not.toBeInTheDocument()
  })

  it('16. la selección manual prevalece sobre respuesta tardía', async () => {
    let resolve:
      ((value: { categoryId: string; confidence: number }) => void) | undefined
    const action: SuggestExpenseCategoryAction = {
      execute: vi.fn(
        () =>
          new Promise<{ categoryId: string; confidence: number }>((next) => {
            resolve = next
          }),
      ),
    }
    renderAIForm(action)
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Supermercado' },
    })
    act(() => vi.advanceTimersByTime(500))
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: CATEGORY_ID },
    })
    await act(async () =>
      resolve?.({ categoryId: CATEGORY_ID, confidence: 0.8 }),
    )
    expect(screen.getByLabelText('Categoría')).toHaveValue(CATEGORY_ID)
    expect(screen.queryByText('Sugerencia: Comida')).not.toBeInTheDocument()
  })

  it('18, 65. error IA no bloquea formulario ni guardado', async () => {
    const onSubmit = vi.fn<(value: ExpenseFormValue) => Promise<void>>(
      async () => undefined,
    )
    renderAIForm(
      { execute: vi.fn(async () => Promise.reject({ code: 'network_error' })) },
      onSubmit,
    )
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Supermercado' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: CATEGORY_ID },
    })
    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: '2026-07-10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('19. rate limit conserva la selección manual', async () => {
    renderAIForm({
      execute: vi.fn(async () => Promise.reject({ code: 'rate_limited' })),
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: CATEGORY_ID },
    })
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Supermercado' },
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(screen.getByLabelText('Categoría')).toHaveValue(CATEGORY_ID)
    expect(screen.getByText(/temporalmente limitadas/)).toBeInTheDocument()
  })

  it('79, 86. estado accesible con texto y no solo color', async () => {
    await showSuggestion({
      execute: vi.fn(async () => ({
        categoryId: CATEGORY_ID,
        confidence: 0.8,
      })),
    })
    expect(
      screen.getByText('Sugerencia: Comida').closest('aside'),
    ).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Sugerencia inteligente')).toBeInTheDocument()
    expect(screen.getByText(/tú decides/)).toBeInTheDocument()
  })
})
