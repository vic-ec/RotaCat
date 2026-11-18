import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TempPasswordIndicator from './TempPasswordIndicator'

// The expiry window is 14 days from temp_password_issued_at, so the clock
// is pinned rather than left to the wall clock.
const ISSUED = '2026-11-10T09:00:00.000Z'

describe('TempPasswordIndicator', () => {
  beforeEach(() => vi.setSystemTime(new Date(2026, 10, 18, 9, 0, 0))) // 18 Nov 2026
  afterEach(() => vi.useRealTimers())

  function trigger() {
    return screen.getByRole('button', { name: /Temporary password|user has not signed in/ })
  }

  // Regression: the explainer opened on pointerenter only, so pressing the
  // shield on a touch screen — where the staff list mostly gets read — did
  // nothing at all.
  it('opens the explainer on click', async () => {
    const user = userEvent.setup()
    render(<TempPasswordIndicator person={{ must_change_password: true, temp_password_issued_at: ISSUED }} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.click(trigger())
    expect(screen.getByRole('tooltip')).toHaveTextContent('Temporary password in use')
  })

  it('names the expiry date, and says so once the window has closed', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TempPasswordIndicator person={{ must_change_password: true, temp_password_issued_at: ISSUED }} />)
    await user.click(trigger())
    expect(screen.getByRole('tooltip')).toHaveTextContent('expires 24 Nov')
    unmount()

    // Issued well over 14 days ago: the admin's cue to regenerate.
    render(<TempPasswordIndicator person={{ must_change_password: true, temp_password_issued_at: '2026-10-01T09:00:00.000Z' }} />)
    await user.click(trigger())
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Temporary password expired/)
  })

  // An account created by an admin and never signed into reads differently
  // from one whose password was simply regenerated.
  it('reads as "never signed in" for an account that has not been used', async () => {
    const user = userEvent.setup()
    render(<TempPasswordIndicator notSignedIn person={{ must_change_password: true, temp_password_issued_at: ISSUED }} />)
    await user.click(trigger())
    expect(screen.getByRole('tooltip')).toHaveTextContent('User account created; user has not signed in')
  })

  it('still opens on a mouse hover', async () => {
    const user = userEvent.setup()
    render(<TempPasswordIndicator person={{ must_change_password: true, temp_password_issued_at: ISSUED }} />)
    await user.hover(trigger())
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
