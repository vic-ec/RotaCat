import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DateFieldButton from './DateFieldButton'

describe('DateFieldButton', () => {
  it('shows the label until a date is picked, then the formatted date', () => {
    const { rerender } = render(<DateFieldButton label="From" value="" onChange={() => {}} />)
    expect(screen.getByText('From')).toBeInTheDocument()

    rerender(<DateFieldButton label="From" value="2026-03-09" onChange={() => {}} />)
    expect(screen.getByText('9 Mar 2026')).toBeInTheDocument()
    expect(screen.queryByText('From')).not.toBeInTheDocument()
  })

  // Chrome/Edge only open the native picker when the click lands on the
  // input's own calendar indicator — a ~20px target at the right edge that
  // `opacity-0` renders invisible. Without this call, clicking anywhere
  // else on the field silently focuses a hidden segment and reads as a
  // dead control.
  it('opens the native picker from a click anywhere on the field', async () => {
    const showPicker = vi.fn()
    HTMLInputElement.prototype.showPicker = showPicker
    const user = userEvent.setup()
    render(<DateFieldButton label="From" value="" onChange={() => {}} />)

    await user.click(screen.getByText('From'))
    expect(showPicker).toHaveBeenCalledTimes(1)

    delete HTMLInputElement.prototype.showPicker
  })

  it('survives a browser without showPicker, and one that throws', async () => {
    const user = userEvent.setup()
    render(<DateFieldButton label="From" value="" onChange={() => {}} />)
    // jsdom has no showPicker at all — the optional call is a no-op.
    await user.click(screen.getByText('From'))

    HTMLInputElement.prototype.showPicker = () => { throw new Error('NotAllowedError') }
    await user.click(screen.getByText('From'))
    expect(screen.getByText('From')).toBeInTheDocument()

    delete HTMLInputElement.prototype.showPicker
  })
})
