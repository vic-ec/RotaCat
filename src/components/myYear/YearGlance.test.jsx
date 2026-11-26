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
