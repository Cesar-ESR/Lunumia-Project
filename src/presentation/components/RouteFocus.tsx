import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function RouteFocus() {
  const { pathname } = useLocation()

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!main) return

    const observer = new MutationObserver(() => focusHeading())
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>('h1')
      if (!heading) return false
      if (!heading.hasAttribute('tabindex'))
        heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
      observer.disconnect()
      return true
    }

    if (!focusHeading())
      observer.observe(main, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [pathname])

  return null
}
