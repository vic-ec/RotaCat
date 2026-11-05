import { useCallback, useEffect, useState } from 'react'

// Detects Caps Lock via the standard KeyboardEvent.getModifierState API,
// checked on every keydown/keyup anywhere on the page so it stays accurate
// if Caps Lock is toggled mid-edit, whichever field (or none) has the
// cursor. The notice is about the keyboard, not about which box is
// focused, so it stays up until a key event reports Caps Lock off — it
// does not clear on blur. Spread the returned handlers onto the password
// input as well (they compose with any handlers already needed for the
// field itself; the window listener covers everything else), and render
// `capsOn` via <CapsLockNotice> (src/components/CapsLockNotice.jsx).
//
// The browser can only read the modifier from a key event, so a toggle
// made while the page is not focused shows up on the next keypress.
export function useCapsLockWarning() {
  const [capsOn, setCapsOn] = useState(false)

  const check = useCallback(e => {
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'))
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', check)
    window.addEventListener('keyup', check)
    return () => {
      window.removeEventListener('keydown', check)
      window.removeEventListener('keyup', check)
    }
  }, [check])

  return { capsOn, onKeyDown: check, onKeyUp: check }
}
