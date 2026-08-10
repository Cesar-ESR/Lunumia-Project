import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorySuggestionPanel } from './CategorySuggestionPanel'
import { createCategoryMock } from '../test/test-factories'

describe('CategorySuggestionPanel teclado', () => {
  it.each([
    ['Usar categoría', 'use'],
    ['Ignorar', 'ignore'],
  ])('80-81. %s funciona con teclado', async (name, expected) => {
    const onUse = vi.fn()
    const onIgnore = vi.fn()
    render(
      <CategorySuggestionPanel
        state={{
          status: 'suggestion',
          suggestion: { categoryId: createCategoryMock().id, confidence: 0.8 },
        }}
        categoryName={createCategoryMock().name}
        onUse={onUse}
        onIgnore={onIgnore}
      />,
    )
    const button = screen.getByRole('button', { name })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(expected === 'use' ? onUse : onIgnore).toHaveBeenCalledOnce()
  })
})
