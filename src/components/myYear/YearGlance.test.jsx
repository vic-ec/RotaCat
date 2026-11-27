import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import YearGlance from './YearGlance'

function days2026() {
  const out = []
  for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ date, weekend: d.getDay() === 0 || d.getDay() === 6, leave: null, leaveGroup: null })
  }
  return out
}

describe('YearGlance on a phone', () => {
  it('a month row opens that month as a calendar to pick a day from, with the planner in its header', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const onSelect = vi.fn()
    render(<MemoryRouter><YearGlance days={days2026()} year={2026} selectedDate={null} onSelect={onSelect} /></MemoryRouter>)
    expect(screen.queryByTestId('month-calendar')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^December: no leave/ }))
    const cal = screen.getByTestId('month-calendar')
    expect(within(cal).getByRole('link', { name: /Annual planner/ })).toHaveAttribute('href', '/leave?tab=planners&sub=annual&month=2026-12')
    await userEvent.click(within(cal).getByRole('button', { name: '8 Dec' }))
    expect(onSelect).toHaveBeenCalledWith('2026-12-08')
    // One month at a time.
    await userEvent.click(screen.getByRole('button', { name: /^March: no leave/ }))
    expect(screen.getAllByTestId('month-calendar')).toHaveLength(1)
  })
})

describe('YearGlance: rotation months and the current month', () => {
  it('shows only the months given (an intern\'s rotation), on a phone and a desktop', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const { unmount } = render(<MemoryRouter><YearGlance days={days2026()} year={2026} selectedDate={null} onSelect={vi.fn()} months={[0, 1, 2, 3]} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /^January:/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^April:/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^May:/ })).not.toBeInTheDocument()
    unmount()
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    render(<MemoryRouter><YearGlance days={days2026()} year={2026} selectedDate={null} onSelect={vi.fn()} months={[0, 8]} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '31 Jan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Sep' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1 Feb' })).not.toBeInTheDocument()
  })

  it('names the current month in the accent', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const now = new Date()
    const year = now.getFullYear()
    const days = []
    for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
      days.push({ date: `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, weekend: false, leave: null, leaveGroup: null })
    }
    const { container } = render(<MemoryRouter><YearGlance days={days} year={year} selectedDate={null} onSelect={vi.fn()} /></MemoryRouter>)
    const marked = container.querySelectorAll('[data-current-month]')
    expect(marked).toHaveLength(1)
    expect(marked[0]).toHaveClass('text-accent')
  })
})

