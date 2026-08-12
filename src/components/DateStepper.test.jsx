import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  describe('Today — hidden on the current period, visible once navigated away', () => {
    it('unit="month": hidden while viewing the current month', () => {
      render(<DateStepper unit="month" year={2026} month={8} onChange={vi.fn()} />)
      // aria-hidden removes it from the accessibility tree, so it's found by
      // text rather than role here — that removal (plus opacity-0 and
      // pointer-events-none) is exactly the "hidden" behaviour under test.
      const today = screen.getByText('Today').closest('button')
      expect(today).toHaveAttribute('aria-hidden', 'true')
      expect(today).toHaveAttribute('tabindex', '-1')
      expect(today).toHaveClass('opacity-0', 'pointer-events-none')
    })

    it('unit="month": visible and clickable once viewing a different month', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<DateStepper unit="month" year={2026} month={3} onChange={onChange} />)
      const today = screen.getByRole('button', { name: 'Today' })
      expect(today).not.toHaveAttribute('aria-hidden')
      expect(today).toHaveClass('opacity-100')
      await user.click(today)
      expect(onChange).toHaveBeenCalledWith(2026, 8)
    })

    it('unit="year": hidden on the current year, visible and functional on any other', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<DateStepper unit="year" year={2026} onChange={vi.fn()} />)
      expect(screen.getByText('Today').closest('button')).toHaveAttribute('aria-hidden', 'true')

      const onChange = vi.fn()
      rerender(<DateStepper unit="year" year={2025} onChange={onChange} />)
      const today = screen.getByRole('button', { name: 'Today' })
      expect(today).not.toHaveAttribute('aria-hidden')
      await user.click(today)
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
  })
})
