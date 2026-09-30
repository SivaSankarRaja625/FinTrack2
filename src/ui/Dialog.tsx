import { useEffectEvent, useId, useLayoutEffect, useRef, type ReactNode } from 'react'

import { Icon } from './Icon'

interface DialogProps {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  size?: 'small' | 'medium' | 'large'
}

function focusableControls(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], summary, [tabindex]',
    ),
  ).filter((element) => {
    if (
      element.tabIndex < 0 ||
      element.matches(':disabled, input[type="hidden"]') ||
      element.closest('[hidden], [inert]')
    )
      return false
    const collapsed = element.closest('details:not([open])')
    return !collapsed || element === collapsed.querySelector(':scope > summary')
  })
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = 'medium',
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const handleClose = useEffectEvent(onClose)

  useLayoutEffect(() => {
    if (!open) return
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const controls = panel ? focusableControls(panel) : []
    const firstFocusable =
      controls.find((element) => element.hasAttribute('data-autofocus')) ??
      controls.find((element) => element.closest('.dialog-content')) ??
      controls[0]
    firstFocusable?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
      if (event.key !== 'Tab' || !panel) return
      const focusable = focusableControls(panel)
      const first = focusable.at(0)
      const last = focusable.at(-1)
      if (!panel.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      panel.contains(active) &&
      !active.matches(':disabled') &&
      !active.closest('[hidden], [inert]')
    )
      return
    const controls = focusableControls(panel)
    const next =
      controls.find((element) => element.closest('.dialog-content')) ?? controls[0]
    next?.focus()
  })

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={`dialog-panel dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p id={descriptionId} className="muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-content">{children}</div>
        {footer ? <footer className="dialog-footer">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  tone?: 'danger' | 'default'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      size="small"
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`button${tone === 'danger' ? ' button-danger' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="notice notice-warning">
        This action cannot be undone from within the app. Create a backup first if you may
        need the record later.
      </div>
    </Dialog>
  )
}
