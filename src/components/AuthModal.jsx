import { useEffect, useRef } from 'react'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { AUTH_MODAL, AUTH_PANEL, AUTH_PANEL_TITLE, AUTH_CLOSE_BUTTON } from '../lib/authStyles'

// The one shell behind every auth-flow dialog — the three Create-account
// forms and Reset your password. A fixed header (title + close), a body
// that is the only part that scrolls, and a footer that stays put under it
// so the primary action is always reachable; two widths (AUTH_MODAL.sizes);
// focus trapped inside while open, Escape and a backdrop click close it,
// and focus goes back to whatever opened it when it closes.
//
// `open` exists for a dialog that stays mounted while closed (Reset your
// password: see LoginPage for why its fields must exist from page load);
// while closed it is invisible, `inert` and unlocked. A dialog that is
// conditionally rendered just leaves it at the default.
//
// `initialFocusRef` names the control to focus once open — focused from an
// effect, after layout, not via the native `autofocus` attribute, which on
// mobile Safari raced the focus zoom against the modal's own layout pass.
// `returnFocusRef` is for a caller that captured its trigger synchronously
// in a click handler; without it the element focused at the moment of
// opening is remembered instead.
//
// Width is calc(100vw - 32px) on a phone (the backdrop's 16px padding), and
// the panel is centred in the window at every size and width.
//
// Header, body and footer all carry `scrollbar-gutter: stable` (the body as
// the scroller, the other two as overflow:hidden boxes), so the body's
// scrollbar track is matched by an equal gutter above and below it and the
// three edges stay aligned whether or not the body scrolls.

const FOCUSABLE = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'iframe',
  '[tabindex]', '[contenteditable="true"]',
].join(',')

function focusableWithin(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => {
    if (el.disabled || el.tabIndex === -1 || el.closest('[inert]') || el.closest('[hidden]')) return false
    const style = window.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

export default function AuthModal({
  open = true, size = 'small', title, titleId, onClose, children, footer,
  initialFocusRef, returnFocusRef, bodyClassName = '',
}) {
  const panelRef = useRef(null)
  const returnTo = useRef(null)
  const pointerDownOnBackdrop = useRef(false)

  useBodyScrollLock(open)

  // Escape closes; Tab and Shift+Tab wrap at the panel's edges.
  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = focusableWithin(panelRef.current)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !panelRef.current.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Remember the opener on open and hand focus back to it on close — both
  // when `open` flips false and when the dialog unmounts.
  useEffect(() => {
    if (open) {
      returnTo.current = returnFocusRef?.current ?? document.activeElement
      return undefined
    }
    const target = returnTo.current
    returnTo.current = null
    target?.focus?.()
    return undefined
  }, [open, returnFocusRef])
  useEffect(() => () => { returnTo.current?.focus?.() }, [])

  useEffect(() => {
    if (open) initialFocusRef?.current?.focus?.()
  }, [open, initialFocusRef])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center scrim-heavy p-4 backdrop-blur-sm ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      // Only a press that both started and ended on the backdrop closes —
      // a drag that starts inside the panel (selecting text) and ends
      // outside it would otherwise register as a backdrop click.
      onPointerDown={(e) => { pointerDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pointerDownOnBackdrop.current) onClose()
        pointerDownOnBackdrop.current = false
      }}
      {...(open ? {} : { inert: '' })}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex w-full flex-col overflow-hidden max-h-[calc(100dvh-32px)] sm:max-h-[calc(100dvh-64px)] ${AUTH_MODAL.sizes[size] || AUTH_MODAL.sizes.small} ${AUTH_PANEL}`}
      >
        <div className={`auth-modal-gutter flex shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-auth-seam ${AUTH_MODAL.padX} ${AUTH_MODAL.padY}`}>
          <h2 id={titleId} className={AUTH_PANEL_TITLE}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={AUTH_CLOSE_BUTTON}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`auth-modal-gutter auth-modal-scroll flex-1 overflow-y-auto overscroll-contain ${AUTH_MODAL.padX} ${AUTH_MODAL.padY} ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <div className={`auth-modal-gutter shrink-0 overflow-hidden border-t border-auth-seam ${AUTH_MODAL.padX} ${AUTH_MODAL.padY}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
