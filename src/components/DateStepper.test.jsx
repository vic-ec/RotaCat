import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DateStepper from './DateStepper'

// Pinned so "current period" is deterministic — same vi.setSystemTime-
// without-useFakeTimers convention as InternRotationsMatrix.test.jsx
// (fake timers + userEvent is a known hang risk).
beforeEach(() => {
  vi.setSystemTime(new Date(2026, 7, 15)) // 15 Aug 2026
})
afterEach(() => vi.useRealTimers())

describe('DateStepper', () => {
  describe('Today — always visible wherever it is offered', () => {
    // It used to fade out on the current period. A control that comes and
    // goes is harder to reach for than one that is simply always there, and
    // a half-faded button reads as broken rather than as "not needed now".
    it('unit="month": visible and interactive even while viewing the current month', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="month" year={2026} month={8} onChange={onChange} />)

      const today = screen.getByRole('button', { name: 'Today' })
      expect(today).not.toHaveAttribute('aria-hidden')
      expect(today).not.toHaveAttribute('tabindex', '-1')
      expect(today.className).not.toMatch(/opacity-0|pointer-events-none/)

      // Pressing it while already on the current period is a harmless no-op
      // from the viewer's side — it still reports the current period.
      await user.click(today)
      expect(onChange).toHaveBeenCalledWith(2026, 8)
    })

    it('unit="month": jumps back to the current month from a different one', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="month" year={2026} month={3} onChange={onChange} />)
      await user.click(screen.getByRole('button', { name: 'Today' }))
      expect(onChange).toHaveBeenCalledWith(2026, 8)
    })

    it('unit="year": visible on the current year and on any other, and functional on both', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<DateStepper unit="year" year={2026} onChange={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()

      const onChange = vi.fn()
      rerender(<DateStepper unit="year" year={2025} onChange={onChange} />)
      await user.click(screen.getByRole('button', { name: 'Today' }))
      expect(onChange).toHaveBeenCalledWith(2026)
    })

    it('showToday=false omits the button entirely, regardless of period', () => {
      render(<DateStepper unit="year" year={2026} onChange={vi.fn()} showToday={false} />)
      expect(screen.queryByText('Today')).not.toBeInTheDocument()
    })
  })

  describe('prev/next', () => {
    it('unit="month" steps month and rolls the year over Dec/Jan', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="month" year={2026} month={12} onChange={onChange} />)
      await user.click(screen.getByRole('button', { name: 'Next month' }))
      expect(onChange).toHaveBeenCalledWith(2027, 1)
    })

    it('unit="year" steps the year alone', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="year" year={2026} onChange={onChange} />)
      await user.click(screen.getByRole('button', { name: 'Previous year' }))
      expect(onChange).toHaveBeenCalledWith(2025)
    })
  })

  describe('month jump sheet', () => {
    it('opens on the label click, lists all 12 months, and picking one calls onChange and closes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="month" year={2026} month={3} onChange={onChange} />)

      await user.click(screen.getByRole('button', { name: 'March 2026' }))
      expect(screen.getByRole('dialog', { name: 'Jump to month' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'January' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'December' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'October' }))
      expect(onChange).toHaveBeenCalledWith(2026, 10)
      expect(screen.queryByRole('dialog', { name: 'Jump to month' })).not.toBeInTheDocument()
    })

    it('body scrolls independently of the sheet, capped so it never grows unbounded past the viewport', async () => {
      const user = userEvent.setup()
      render(<DateStepper unit="month" year={2026} month={3} onChange={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'March 2026' }))

      const dialog = screen.getByRole('dialog', { name: 'Jump to month' })
      expect(dialog.className).toContain('max-h-[80vh]')
      const body = screen.getByRole('button', { name: 'December' }).closest('.overflow-y-auto')
      expect(body).not.toBeNull()
    })

    it('tapping the year label swaps to a 12-year grid, renaming the dialog to "Jump to year" and back once a year\'s picked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="month" year={2026} month={3} onChange={onChange} />)
      await user.click(screen.getByRole('button', { name: 'March 2026' }))
      const dialog = screen.getByRole('dialog') // only one dialog open at a time, name changes below

      await user.click(within(dialog).getByRole('button', { name: '2026' }))
      expect(dialog).toHaveAttribute('aria-label', 'Jump to year')
      // 2026 falls in the 2016–2027 page (Math.floor(2026/12)*12 = 2016).
      expect(within(dialog).getByRole('button', { name: '2020' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'March' })).not.toBeInTheDocument()

      // Picking a year lands back on the month grid for it, not closed,
      // and the dialog's name reverts to "Jump to month".
      await user.click(within(dialog).getByRole('button', { name: '2020' }))
      expect(dialog).toHaveAttribute('aria-label', 'Jump to month')
      expect(within(dialog).getByRole('button', { name: 'March' })).toBeInTheDocument()
      expect(onChange).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'October' }))
      expect(onChange).toHaveBeenCalledWith(2020, 10)
    })

    it('the embedded year grid pages a whole 12-year block at a time, independent of the month stepper', async () => {
      const user = userEvent.setup()
      render(<DateStepper unit="month" year={2026} month={3} onChange={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'March 2026' }))
      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: '2026' }))

      // Initial page is 2016–2027.
      expect(within(dialog).getByRole('button', { name: '2027' })).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Next years' }))
      // Next page is 2028–2039.
      expect(within(dialog).queryByRole('button', { name: '2027' })).not.toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: '2028' })).toBeInTheDocument()
    })
  })

  describe('year jump sheet', () => {
    it('opens on the label click, lists a 12-year range around the current year, and picking one calls onChange and closes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="year" year={2026} onChange={onChange} />)

      await user.click(screen.getByRole('button', { name: '2026' }))
      const dialog = within(screen.getByRole('dialog', { name: 'Jump to year' }))
      const yearButton = dialog.getByRole('button', { name: '2026' })
      expect(yearButton).toHaveAttribute('aria-current', 'true')

      await user.click(dialog.getByRole('button', { name: '2020' }))
      expect(onChange).toHaveBeenCalledWith(2020)
      expect(screen.queryByRole('dialog', { name: 'Jump to year' })).not.toBeInTheDocument()
    })

    it('the range stepper pages a whole 12-year block at a time', async () => {
      const user = userEvent.setup()
      render(<DateStepper unit="year" year={2026} onChange={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: '2026' }))

      const range = screen.getByText(/–/, { selector: 'span' })
      const before = range.textContent
      await user.click(screen.getByRole('button', { name: 'Next years' }))
      expect(screen.getByText(/–/, { selector: 'span' }).textContent).not.toBe(before)
    })
  })

  describe('centered layout', () => {
    it('flanks the label with equal-width chevrons instead of the default left-flowing row', () => {
      render(<DateStepper unit="month" year={2026} month={3} onChange={vi.fn()} showToday={false} centered />)
      const label = screen.getByRole('button', { name: 'March 2026' })
      expect(label.className).toContain('flex-1')
      expect(label.className).toContain('text-center')
    })

    it('off by default — the label stays left-flowing, un-centered', () => {
      render(<DateStepper unit="month" year={2026} month={3} onChange={vi.fn()} showToday={false} />)
      const label = screen.getByRole('button', { name: 'March 2026' })
      expect(label.className).not.toContain('flex-1')
    })
  })
})
