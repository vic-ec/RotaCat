import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldAlert } from 'lucide-react'
import { isTempPasswordExpired, tempPasswordExpiresAt, formatExpiryDate } from '../lib/tempPassword'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

// Admin-only marker for an account still sitting on the password an admin
// generated for it (profiles.must_change_password). It clears itself the
// moment that person signs in and sets their own, so it doubles as the
// answer to "did they ever actually get in?" — an admin who creates an
// account otherwise has no signal at all between creating it and the
// person turning up on a roster. Pairs with the row's "Regenerate
// password" action for the case where the answer is no. The temp
// password is good for 14 days (tempPassword.js); the label carries the
// expiry date and turns rose once it has passed, which is the cue to
// regenerate. must_change_password itself only clears on a real sign-in.
//
// Icon-only (not a permanent text badge) — the explanation opens on
// hover for a real mouse (checked via pointerType, not CSS :hover, since
// this opens a portalled panel rather than a same-DOM-subtree sibling a
// group-hover could reach) and on a click or tap for everyone else. It
// used to be hover-only, on the reasoning that the mobile card list
// repeats the fact inside its own detail sheet; but the icon is on the
// row, a row away from that sheet, and an icon that answers nothing when
// you press it reads as broken. Neutral palette on
// purpose: this is informational, not a status — the flag*/success
// colours are reserved for roster state (see tailwind.config.js), and
// being new is not a fault.
// `notSignedIn`: the account is also inactive — created by an admin and
// never used. That reads as "User account created; user has not signed in"
// in rose, rather than the neutral temp-password note an active account
// (e.g. one whose password was regenerated) gets.
const NOT_SIGNED_IN_LABEL = 'User account created; user has not signed in'
const TEMP_PASSWORD_LABEL = 'Temporary password in use'

// "… · expires 28 Nov", or "Temporary password expired 28 Nov" once the
// 14-day window has closed (tempPassword.js) — the admin's cue to
// regenerate. An account from before the window has no date and reads as
// before.
function tempPasswordLabel(person, notSignedIn) {
  const base = notSignedIn ? NOT_SIGNED_IN_LABEL : TEMP_PASSWORD_LABEL
  const expiresAt = tempPasswordExpiresAt(person?.temp_password_issued_at)
  if (!expiresAt) return { label: base, expired: false }
  if (isTempPasswordExpired(person)) return { label: `Temporary password expired ${formatExpiryDate(expiresAt)}`, expired: true }
  return { label: `${base} · expires ${formatExpiryDate(expiresAt)}`, expired: false }
}

export default function TempPasswordIndicator({ className = '', notSignedIn = false, person }) {
  const { label, expired } = tempPasswordLabel(person, notSignedIn)
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  // Pointer type of the last press on the shield — a touch/pen tap on an
  // open shield closes it again, a mouse click doesn't (see onClick).
  const lastPointerTypeRef = useRef('mouse')
  useDismissablePopover(open, () => setOpen(false), popRef, [triggerRef])

  function show() {
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  // Only for keeping the pill on screen — the pill itself is sized to its
  // text (max-content) with equal padding either side.
  const width = notSignedIn || expired ? 300 : 260
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <span className={`relative inline-flex flex-shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onPointerEnter={e => { if (e.pointerType === 'mouse') show() }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(false) }}
        // Kept off the row: a Staff list row starts its long-press timer
        // (the quick-actions menu) on pointerdown, so holding the shield
        // opened that menu too.
        onPointerDown={e => { lastPointerTypeRef.current = e.pointerType; e.stopPropagation() }}
        // Hover alone left this silent on a touch screen, which is where
        // the staff list mostly gets read. A tap toggles, so tapping the
        // shield again closes it. A mouse click only opens: the
        // pointer-enter has already opened it, and toggling would close
        // what the hover just opened. Tapping anywhere else dismisses it
        // too (useDismissablePopover above).
        onClick={e => {
          e.stopPropagation()
          if (open && lastPointerTypeRef.current !== 'mouse') setOpen(false)
          else show()
        }}
        aria-label={label}
        aria-expanded={open}
        className={`flex h-5 w-5 items-center justify-center rounded-full ${notSignedIn || expired ? 'text-rose hover:text-rose-dark' : 'text-ink-muted hover:text-ink'}`}
      >
        <ShieldAlert className="h-3.5 w-3.5" />
      </button>
      {open && positionStyle && createPortal(
        // Tapping the pill itself closes it — the obvious place to tap,
        // which used to do nothing. Both handlers stop propagation because
        // React bubbles events through a portal to its React ancestors, not
        // its DOM ones: the pill is drawn on <body>, but a tap on it still
        // reached the Staff list row this shield sits in, opening that
        // person's detail sheet (or, held, the row's quick-actions menu).
        <div
          ref={popRef}
          role="tooltip"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setOpen(false) }}
          style={{ ...positionStyle, width: 'max-content' }}
          className="fixed z-50 whitespace-nowrap rounded-full border border-edge bg-canvas-raised px-3 py-1.5 text-xs font-medium text-ink shadow-raised"
        >
          {label}
        </div>,
        document.body
      )}
    </span>
  )
}
