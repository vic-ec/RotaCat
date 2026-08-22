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
  describe('Today — hidden on the current period, visible once navigated away', () => {
    it('unit="month": hidden while viewing the current month', () => {
      render(<DateStepper unit="month" year={2026} month={8} onChange={vi.fn()} />)
      // aria-hidden makes the button's own computed accessible name empty
      // (that's the point — a screen reader never announces it at all), so
      // `getByRole('button', { name: 'Today' })` can't find it here; its
      // `title` attribute isn't affected by aria-hidden the same way, so
      // that's what locates it instead. The aria-hidden/tabindex/opacity
      // trio below is exactly the "hidden" behaviour under test.
      const today = screen.getByTitle('Today')
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
      expect(screen.getByTitle('Today')).toHaveAttribute('aria-hidden', 'true')

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
