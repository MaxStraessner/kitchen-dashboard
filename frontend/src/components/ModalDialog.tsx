import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let openDialogs = 0
let previousOverflow = ''

export function ModalDialog({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    const root = dialog.current
    if (!root) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    const focusable = () =>
      [
        ...root.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ].filter((node) => !node.hidden && !node.closest('[hidden]'))
    ;(focusable()[0] ?? root).focus()
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelectorAll('[data-modal]').item(openDialogs - 1) !== root) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
      }
      if (event.key === 'Tab') {
        const nodes = focusable()
        const first = nodes[0] ?? root
        const last = nodes.at(-1) ?? root
        if (
          event.shiftKey &&
          (document.activeElement === first || !root.contains(document.activeElement))
        ) {
          event.preventDefault()
          last.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !root.contains(document.activeElement))
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('keydown', keydown, true)
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [])
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        className={`modal-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-modal
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="dialog-close"
            aria-label="Dialog schließen"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}
