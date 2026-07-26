import { useCallback, useState } from 'react'

// Detects Caps Lock while a field has focus, via the standard
// KeyboardEvent.getModifierState API — checked on every keydown/keyup so it
// stays accurate if Caps Lock is toggled mid-edit, and cleared on blur so a
// stale warning doesn't linger once the user's moved on. Spread the
// returned handlers onto the input (they compose with any handlers already
// needed for the field itself), and render `capsOn` via <CapsLockNotice>
// (src/components/CapsLockNotice.jsx).
export function useCapsLockWarning() {
  const [capsOn, setCapsOn] = useState(false)

  const check = useCallback(e => {
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'))
    }
  }, [])

  const clear = useCallback(() => setCapsOn(false), [])

  return { capsOn, onKeyDown: check, onKeyUp: check, onBlur: clear }
}
