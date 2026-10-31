import { useCallback, useEffect, useState } from 'react'

const noop = () => {}

// Detects Caps Lock via the standard KeyboardEvent.getModifierState API —
// checked on every keydown/keyup so it stays accurate if Caps Lock is
// toggled mid-edit. Spread the returned handlers onto the input (they
// compose with any handlers already needed for the field itself), and
// render `capsOn` via <CapsLockNotice> (src/components/CapsLockNotice.jsx).
//
// By default the warning is scoped to the one field: it clears on blur so
// a stale notice doesn't linger once the user has moved on. The login
// form asks for `persistent` instead: the state follows key events
// anywhere on the page (so typing in the email field, or pressing Caps
// Lock itself with the button focused, keeps it current) and it stays up
// until Caps Lock is actually off — the notice is about the keyboard, not
// about which box has the cursor.
export function useCapsLockWarning({ persistent = false } = {}) {
  const [capsOn, setCapsOn] = useState(false)

  const check = useCallback(e => {
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'))
    }
  }, [])

  const clear = useCallback(() => setCapsOn(false), [])

  useEffect(() => {
    if (!persistent) return undefined
    window.addEventListener('keydown', check)
    window.addEventListener('keyup', check)
    return () => {
      window.removeEventListener('keydown', check)
      window.removeEventListener('keyup', check)
    }
  }, [persistent, check])

  return { capsOn, onKeyDown: check, onKeyUp: check, onBlur: persistent ? noop : clear }
}
