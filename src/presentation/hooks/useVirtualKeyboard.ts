import { useEffect, useRef, useState } from 'react'

const KEYBOARD_THRESHOLD_PX = 120

function isEditable(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

export function useVirtualKeyboard(): {
  open: boolean
  offset: number
} {
  const [keyboard, setKeyboard] = useState({ open: false, offset: 0 })
  const baselineHeight = useRef(0)

  useEffect(() => {
    const viewport = window.visualViewport
    const initialHeight = viewport?.height ?? window.innerHeight
    baselineHeight.current = Math.max(initialHeight, window.innerHeight)

    const update = () => {
      const height = viewport?.height ?? window.innerHeight
      const focused = isEditable(document.activeElement)
      if (!focused)
        baselineHeight.current = Math.max(height, window.innerHeight)
      const offset = Math.max(0, Math.round(baselineHeight.current - height))
      const open = focused && offset >= KEYBOARD_THRESHOLD_PX
      setKeyboard((current) =>
        current.open === open && current.offset === (open ? offset : 0)
          ? current
          : { open, offset: open ? offset : 0 },
      )
      const activeElement = document.activeElement
      if (open && activeElement instanceof HTMLElement)
        window.requestAnimationFrame(() => {
          if (
            isEditable(activeElement) &&
            typeof activeElement.scrollIntoView === 'function'
          )
            activeElement.scrollIntoView({
              block: 'nearest',
              inline: 'nearest',
            })
        })
    }

    const settleFocus = () => window.setTimeout(update, 0)
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', settleFocus)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', settleFocus)
    }
  }, [])

  return keyboard
}
