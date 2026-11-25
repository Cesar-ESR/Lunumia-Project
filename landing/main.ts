import './styles.css'
import { initializeTheme } from './theme'

const disposeTheme = initializeTheme()
if (import.meta.hot) import.meta.hot.dispose(disposeTheme)

const year = document.querySelector<HTMLElement>('[data-current-year]')
if (year) year.textContent = String(new Date().getFullYear())

const privacyFlow = document.querySelector<HTMLElement>('[data-privacy-flow]')
if (privacyFlow) {
  const buttons = [
    ...privacyFlow.querySelectorAll<HTMLButtonElement>('[data-privacy-mode]'),
  ]
  const storage = privacyFlow.querySelector<HTMLElement>(
    '[data-privacy-storage]',
  )
  const cloud = privacyFlow.querySelector<HTMLElement>('[data-privacy-cloud]')
  const cloudStatus = privacyFlow.querySelector<HTMLElement>(
    '[data-privacy-cloud-status]',
  )
  const aiStatus = privacyFlow.querySelector<HTMLElement>(
    '[data-privacy-ai-status]',
  )
  const setMode = (mode: 'guest' | 'account') => {
    const account = mode === 'account'
    privacyFlow.dataset.mode = mode
    buttons.forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.privacyMode === mode),
      ),
    )
    if (storage)
      storage.textContent = account
        ? 'Almacenamiento local + respaldo'
        : '0 datos en la nube'
    if (cloud) cloud.setAttribute('aria-disabled', String(!account))
    if (cloudStatus)
      cloudStatus.textContent = account
        ? 'Sincronización activa'
        : 'Desactivada'
    if (aiStatus)
      aiStatus.textContent = account
        ? 'Bajo demanda (Solo cuando tú lo solicitas)'
        : 'Solo local (IA y OCR desactivados)'
  }
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const mode = button.dataset.privacyMode
      if (mode === 'guest' || mode === 'account') setMode(mode)
    }),
  )
  setMode('guest')
}

const capabilityCard = document.querySelector<HTMLElement>(
  '[data-capability-card]',
)
if (capabilityCard) {
  const tabs = [
    ...capabilityCard.querySelectorAll<HTMLButtonElement>(
      '[data-capability-tab]',
    ),
  ]
  const preview = capabilityCard.querySelector<HTMLImageElement>(
    '[data-capability-image]',
  )
  const panel = capabilityCard.querySelector<HTMLElement>('[role="tabpanel"]')
  const title = capabilityCard.querySelector<HTMLElement>(
    '[data-capability-window-title]',
  )
  const items = [
    { id: 'movimientos', image: 'movimientos' },
    { id: 'presupuestos', image: 'presupuesto' },
    { id: 'compromisos', image: 'compromiso' },
    { id: 'proyeccion', image: 'proyeccion' },
  ]
  let activeIndex = 0
  let manuallySelected = false
  let inViewport = false
  let hovered = false
  let interval: number | undefined

  const activeTheme = () =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const render = (index: number) => {
    activeIndex = index
    const item = items[index]
    const tab = tabs[index]
    if (!item || !tab || !preview || !panel || !title) return
    tabs.forEach((candidate, candidateIndex) => {
      const selected = candidateIndex === index
      candidate.setAttribute('aria-selected', String(selected))
      candidate.tabIndex = selected ? 0 : -1
    })
    panel.setAttribute('aria-labelledby', tab.id)
    title.textContent = item.id
    preview.classList.add('is-changing')
    window.setTimeout(() => {
      preview.src = `/images/${activeTheme()}/${item.image}-${activeTheme()}.webp`
      preview.alt = `Vista de ${tab.textContent?.trim().toLowerCase()} en Lunumia`
      preview.classList.remove('is-changing')
    }, 180)
    capabilityCard.style.setProperty(
      '--capability-progress',
      `${((index + 1) / items.length) * 100}%`,
    )
  }
  const stop = () => {
    if (interval !== undefined) window.clearInterval(interval)
    interval = undefined
    capabilityCard.classList.remove('is-autoplaying')
  }
  const syncAutoplay = () => {
    stop()
    if (manuallySelected || !inViewport || hovered || items.length < 2) return
    capabilityCard.classList.add('is-autoplaying')
    interval = window.setInterval(() => {
      render((activeIndex + 1) % items.length)
      capabilityCard.classList.add('is-autoplaying')
    }, 5500)
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      manuallySelected = true
      stop()
      render(index)
    })
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = (index + direction + tabs.length) % tabs.length
      tabs[next]?.focus()
      render(next)
      manuallySelected = true
      stop()
    })
  })
  capabilityCard.addEventListener('mouseenter', () => {
    hovered = true
    capabilityCard.classList.add('is-paused')
    syncAutoplay()
  })
  capabilityCard.addEventListener('mouseleave', () => {
    hovered = false
    capabilityCard.classList.remove('is-paused')
    syncAutoplay()
  })
  const observer = new IntersectionObserver(
    ([entry]) => {
      inViewport = Boolean(entry?.isIntersecting)
      syncAutoplay()
    },
    { threshold: 0.35 },
  )
  observer.observe(capabilityCard)
  const themeObserver = new MutationObserver(() => {
    if (!preview) return
    const item = items[activeIndex]
    if (item)
      preview.src = `/images/${activeTheme()}/${item.image}-${activeTheme()}.webp`
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  render(0)
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      stop()
      observer.disconnect()
      themeObserver.disconnect()
    })
}
