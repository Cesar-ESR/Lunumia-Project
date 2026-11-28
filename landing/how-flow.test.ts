import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import source from './index.html?raw'
import { initializeHowFlow } from './how-flow'
import { renderLandingHtml } from './site-contract'

let section: HTMLElement
let dispose: () => void

beforeEach(() => {
  dispose?.()
  const parsed = new DOMParser().parseFromString(
    renderLandingHtml(source),
    'text/html',
  )
  section = parsed.querySelector<HTMLElement>('#como-funciona')!
  document.body.append(section)
  section.ownerDocument.documentElement.dataset.theme = 'light'
  dispose = initializeHowFlow(section)
})

afterEach(() => {
  dispose?.()
  vi.useRealTimers()
  section.remove()
})

describe('How it works interactive flow', () => {
  it('switches preview content and product screenshot when a step is selected', () => {
    const tabs = [
      ...section.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ]
    const panel = section.querySelector<HTMLElement>('[role="tabpanel"]')!
    const image = section.querySelector<HTMLImageElement>('[data-how-image]')!

    tabs[1]!.click()

    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false')
    expect(panel.getAttribute('aria-labelledby')).toBe('how-step-2')
    expect(
      section.querySelector('[data-how-panel-title]')?.textContent,
    ).toContain('Entiende tu situación')
    expect(section.querySelector('[data-how-count]')?.textContent).toBe(
      'Paso 2 de 3',
    )
    expect(image.getAttribute('src')).toBe(
      '/images/light/presupuesto-light.webp',
    )
    expect(image.getAttribute('alt')).toBe(
      'Presupuestos por categoría en Lunumia',
    )
  })

  it('supports vertical tab keyboard controls and cleans up its listeners', () => {
    const tabs = [
      ...section.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ]

    tabs[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    )

    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    dispose()
    tabs[1]!.click()
    expect(
      section.querySelector('[data-how-panel-title]')?.textContent,
    ).toContain('Entiende tu situación')
  })

  it('avanza automáticamente cada cinco segundos y se pausa al interactuar', () => {
    vi.useFakeTimers()
    dispose()
    dispose = initializeHowFlow(section)
    const tabs = [
      ...section.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ]

    vi.advanceTimersByTime(5000)
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')

    const flow = section.querySelector<HTMLElement>('[data-how-flow]')!
    flow.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(5000)
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')

    flow.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(5000)
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true')
  })
})
