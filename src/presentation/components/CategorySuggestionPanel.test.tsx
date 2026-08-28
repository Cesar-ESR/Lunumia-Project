import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorySuggestionPanel } from './CategorySuggestionPanel'
import { createCategoryMock } from '../test/test-factories'

describe('CategorySuggestionPanel teclado', () => {
  function renderSuggestion() {
    const category = createCategoryMock()
    const onUse = vi.fn()
    const onIgnore = vi.fn()

    const view = render(
      <CategorySuggestionPanel
        state={{
          status: 'suggestion',
          suggestion: { categoryId: category.id, confidence: 0.8 },
        }}
        categoryName={category.name}
        onUse={onUse}
        onIgnore={onIgnore}
      />,
    )

    return { ...view, category, onUse, onIgnore }
  }

  it('mantiene encabezado, contenido y acciones en bloques ordenados', () => {
    const { container, category } = renderSuggestion()
    const card = container.querySelector('.ai-suggestion')
    const header = container.querySelector('.ai-suggestion__header')
    const content = container.querySelector('.ai-suggestion__content')
    const actions = screen.getByRole('group', {
      name: 'Acciones de sugerencia',
    })

    expect(card).not.toBeNull()
    expect(header).toHaveTextContent('Sugerencia inteligente')
    expect(content).toHaveTextContent(`Sugerencia: ${category.name}`)
    expect(Array.from(card?.children ?? [])).toEqual([header, content, actions])
    expect(screen.getByRole('button', { name: 'Usar categoría' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ignorar' })).toBeVisible()
  })

  it.each([
    ['Usar categoría', 'use'],
    ['Ignorar', 'ignore'],
  ])('80-81. %s funciona con teclado', async (name, expected) => {
    const { onUse, onIgnore } = renderSuggestion()
    const button = screen.getByRole('button', { name })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(expected === 'use' ? onUse : onIgnore).toHaveBeenCalledOnce()
  })
})
