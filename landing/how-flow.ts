export function initializeHowFlow(root: ParentNode = document) {
  const flow = root.querySelector<HTMLElement>('[data-how-flow]')
  if (!flow) return () => undefined

  const documentRoot = root instanceof Document ? root : root.ownerDocument
  const tabs = [
    ...flow.querySelectorAll<HTMLButtonElement>('[role="tab"][data-how-step]'),
  ]
  const panel = flow.querySelector<HTMLElement>('[role="tabpanel"]')
  const title = flow.querySelector<HTMLElement>('[data-how-panel-title]')
  const description = flow.querySelector<HTMLElement>(
    '[data-how-panel-description]',
  )
  const label = flow.querySelector<HTMLElement>('[data-how-label]')
  const count = flow.querySelector<HTMLElement>('[data-how-count]')
  const image = flow.querySelector<HTMLImageElement>('[data-how-image]')

  if (
    !tabs.length ||
    !panel ||
    !title ||
    !description ||
    !label ||
    !count ||
    !image
  )
    return () => undefined

  let activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
  )
  const view = documentRoot?.defaultView
  const reducedMotion =
    view && typeof view.matchMedia === 'function'
      ? view.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  let isHovered = false
  let isFocused = false

  const updateImage = (tab: HTMLButtonElement) => {
    const imageName = tab.dataset.image
    if (!imageName) return
    const theme =
      documentRoot?.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    image.src = `/images/${theme}/${imageName}-${theme}.webp`
    image.alt = tab.dataset.imageAlt ?? ''
  }

  const activate = (index: number, moveFocus = false) => {
    const tab = tabs[index]
    if (!tab) return
    activeIndex = index
    tabs.forEach((candidate, candidateIndex) => {
      const selected = candidateIndex === index
      candidate.setAttribute('aria-selected', String(selected))
      candidate.tabIndex = selected ? 0 : -1
    })
    panel.setAttribute('aria-labelledby', tab.id)
    title.textContent = tab.dataset.howStepTitle ?? ''
    description.textContent = tab.dataset.description ?? ''
    label.textContent = tab.dataset.label ?? ''
    count.textContent = `Paso ${index + 1} de ${tabs.length}`
    flow.style.setProperty(
      '--how-progress',
      `${tabs.length <= 1 ? 100 : (index / (tabs.length - 1)) * 100}%`,
    )
    updateImage(tab)
    if (moveFocus) tab.focus()
  }

  const clickHandlers = new Map<HTMLButtonElement, () => void>()
  const keyHandlers = new Map<
    HTMLButtonElement,
    (event: KeyboardEvent) => void
  >()
  tabs.forEach((tab, index) => {
    const onClick = () => activate(index)
    const onKeyDown = (event: KeyboardEvent) => {
      let nextIndex: number | null = null
      if (event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length
      if (event.key === 'ArrowUp')
        nextIndex = (index - 1 + tabs.length) % tabs.length
      if (event.key === 'Home') nextIndex = 0
      if (event.key === 'End') nextIndex = tabs.length - 1
      if (nextIndex === null) return
      event.preventDefault()
      activate(nextIndex, true)
    }
    clickHandlers.set(tab, onClick)
    keyHandlers.set(tab, onKeyDown)
    tab.addEventListener('click', onClick)
    tab.addEventListener('keydown', onKeyDown)
  })

  const onPointerEnter = () => {
    isHovered = true
  }
  const onPointerLeave = () => {
    isHovered = false
  }
  const onFocusIn = () => {
    isFocused = true
  }
  const onFocusOut = (event: FocusEvent) => {
    if (!flow.contains(event.relatedTarget as Node | null)) isFocused = false
  }
  flow.addEventListener('pointerenter', onPointerEnter)
  flow.addEventListener('pointerleave', onPointerLeave)
  flow.addEventListener('focusin', onFocusIn)
  flow.addEventListener('focusout', onFocusOut)

  const timer =
    view && !reducedMotion?.matches
      ? view.setInterval(() => {
          if (documentRoot?.hidden || isHovered || isFocused) return
          activate((activeIndex + 1) % tabs.length)
        }, 5000)
      : undefined

  const themeObserver = documentRoot
    ? new MutationObserver(() => updateImage(tabs[activeIndex]!))
    : null
  themeObserver?.observe(documentRoot!.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  activate(activeIndex)

  return () => {
    if (timer !== undefined) view?.clearInterval(timer)
    flow.removeEventListener('pointerenter', onPointerEnter)
    flow.removeEventListener('pointerleave', onPointerLeave)
    flow.removeEventListener('focusin', onFocusIn)
    flow.removeEventListener('focusout', onFocusOut)
    tabs.forEach((tab) => {
      const onClick = clickHandlers.get(tab)
      const onKeyDown = keyHandlers.get(tab)
      if (onClick) tab.removeEventListener('click', onClick)
      if (onKeyDown) tab.removeEventListener('keydown', onKeyDown)
    })
    themeObserver?.disconnect()
  }
}
