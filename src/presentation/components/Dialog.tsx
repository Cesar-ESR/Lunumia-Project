import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute('hidden'))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
}

export function Dialog({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  initialFocusRef,
  closeOnEscape = true,
  pending = false,
  className = '',
}: {
  open: boolean
  title: string
  description?: string
  children?: ReactNode
  actions?: ReactNode
  onClose(): void
  initialFocusRef?: RefObject<HTMLElement | null>
  closeOnEscape?: boolean
  pending?: boolean
  className?: string
}) {
  const reactId = useId()
  const titleId = `dialog-title-${reactId}`
  const descriptionId = description
    ? `dialog-description-${reactId}`
    : undefined
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const requestedTarget = initialFocusRef?.current
    const target =
      requestedTarget instanceof HTMLButtonElement && requestedTarget.disabled
        ? titleRef.current
        : (requestedTarget ?? titleRef.current)
    target?.focus()
  }, [initialFocusRef, open])

  useEffect(() => {
    if (!open) return
    const backdrop = backdropRef.current
    const bodyOverflow = document.body.style.overflow
    const background = Array.from(document.body.children).filter(
      (element) => element !== backdrop,
    )
    const previous = background.map((element) => ({
      element,
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }))

    document.body.style.overflow = 'hidden'
    background.forEach((element) => {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    })

    return () => {
      document.body.style.overflow = bodyOverflow
      previous.forEach(({ element, inert, ariaHidden }) => {
        if (!inert) element.removeAttribute('inert')
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      })
      const restoreTarget = restoreFocusRef.current
      if (restoreTarget?.isConnected) restoreTarget.focus()
      else {
        const fallback = document.querySelector<HTMLElement>(
          '[data-focus-fallback], main',
        )
        fallback?.focus()
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const backdrop = backdropRef.current
    if (!backdrop) return
    const handleNativeBack = () => {
      if (closeOnEscape && !pending) onClose()
    }
    backdrop.addEventListener('lunumia:native-back', handleNativeBack)
    return () =>
      backdrop.removeEventListener('lunumia:native-back', handleNativeBack)
  }, [closeOnEscape, onClose, open, pending])

  if (!open) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && closeOnEscape && !pending) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const elements = focusableElements(dialogRef.current)
    if (elements.length === 0) {
      event.preventDefault()
      dialogRef.current.focus()
      return
    }
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    } else if (!dialogRef.current.contains(document.activeElement)) {
      event.preventDefault()
      first?.focus()
    }
  }

  return createPortal(
    <div
      ref={backdropRef}
      className="ln-dialog-backdrop"
      data-native-back-target
      onKeyDown={handleKeyDown}
    >
      <section
        ref={dialogRef}
        className={`ln-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending || undefined}
        tabIndex={-1}
      >
        <header className="ln-dialog__header">
          <h2
            ref={titleRef}
            id={titleId}
            className="ln-dialog__title"
            tabIndex={-1}
          >
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="ln-dialog__description">
              {description}
            </p>
          ) : null}
        </header>
        {children ? <div className="ln-dialog__body">{children}</div> : null}
        {actions ? <div className="ln-dialog__actions">{actions}</div> : null}
      </section>
    </div>,
    document.body,
  )
}
