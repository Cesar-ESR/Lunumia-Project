import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LunumiaBrandSymbol } from './LunumiaBrandSymbol'

describe('LunumiaBrandSymbol', () => {
  it('renders the official symbol as a decorative, proportion-preserving image', () => {
    const { container } = render(<LunumiaBrandSymbol />)
    const symbol = container.querySelector('img.ln-brand-mark')

    expect(symbol?.getAttribute('src')).toContain(
      'lunumia-symbol-1024x1024.png',
    )
    expect(symbol).toHaveAttribute('alt', '')
    expect(symbol).toHaveAttribute('aria-hidden', 'true')
    expect(symbol).toHaveAttribute('width', '36')
    expect(symbol).toHaveAttribute('height', '36')
    expect(symbol).toHaveAttribute('draggable', 'false')
  })
})
