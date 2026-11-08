import { useEffect, useState } from 'react'
import { PASSWORD_HINT } from '../lib/passwordPolicy'

// Small "i" icon that sits next to a new-password field's label — hover
// reveals the requirements on desktop, tap opens them on mobile (no hover
// there). Once opened by a tap it stays until the person taps anywhere
// outside it or presses Escape: a transparent full-screen catcher behind
// the bubble takes that tap and swallows it, so the page under it does not
// act on the same touch. Previously declared verbatim in SignupPage and
// ResetPasswordPage, and needed a third time on SetPasswordPage.
//
// The bubble is a themed panel (raised surface, edge, ink) rather than a
// fixed dark tooltip, so it reads as part of the page on both themes
// instead of flipping to a light block on the dark one.
//
// `align`: 'left' anchors the bubble to the icon's left edge — for a
// field close to a narrow container's left edge, where a centred bubble
// would spill past it and get clipped by an `overflow-hidden` ancestor.
// 'center' hangs it under the icon, which reads better with room on both
// sides.
export default function PasswordRequirementsInfo({ align = 'left' }) {
  const [show, setShow] = useState(false)
  const anchorClass = align === 'center'
    ? 'left-1/2 -translate-x-1/2'
    : 'left-0'

  useEffect(() => {
    if (!show) return undefined
    function onKey(e) { if (e.key === 'Escape') setShow(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [show])

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label="Password requirements"
        aria-expanded={show}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-muted text-[10px] font-semibold leading-none text-ink-muted transition-colors hover:border-ink hover:text-ink"
      >
        i
      </button>
      {show && (
        <span
          className="fixed inset-0 z-10 cursor-default"
          aria-hidden="true"
          onClick={() => setShow(false)}
        />
      )}
      <span
        role="tooltip"
        className={`absolute top-full z-20 mt-2 w-56 rounded-lg border border-edge bg-canvas-raised px-3 py-2 text-xs font-normal normal-case text-ink shadow-raised transition-opacity ${anchorClass} ${
          show ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:opacity-100'
        }`}
      >
        {PASSWORD_HINT}
      </span>
    </span>
  )
}
