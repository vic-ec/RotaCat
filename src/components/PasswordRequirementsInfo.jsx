import { useState } from 'react'
import { PASSWORD_HINT } from '../lib/passwordPolicy'

// Small "i" icon that sits next to a new-password field's label — hover
// reveals the requirements on desktop, tap toggles them on mobile (no
// hover there). Previously declared verbatim in SignupPage and
// ResetPasswordPage, and needed a third time on SetPasswordPage; the two
// copies had already drifted on tooltip anchoring, which is the `align`
// prop below.
//
// `align`: 'left' anchors the tooltip to the icon's left edge — for a
// field close to a narrow container's left edge, where a centred tooltip
// would spill past it and get clipped by an `overflow-hidden` ancestor.
// 'center' hangs it under the icon, which reads better with room on both
// sides.
export default function PasswordRequirementsInfo({ align = 'left' }) {
  const [show, setShow] = useState(false)
  const anchorClass = align === 'center'
    ? 'left-1/2 -translate-x-1/2'
    : 'left-0'

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        onBlur={() => setShow(false)}
        aria-label="Password requirements"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-muted text-[10px] font-semibold leading-none text-ink-muted transition-colors hover:border-ink hover:text-ink"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-20 mt-2 w-56 rounded-lg bg-ink px-3 py-2 text-xs font-normal normal-case text-white shadow-card transition-opacity ${anchorClass} ${
          show ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {PASSWORD_HINT}
      </span>
    </span>
  )
}
