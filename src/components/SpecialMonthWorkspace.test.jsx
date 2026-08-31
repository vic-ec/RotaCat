import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SpecialMonthWorkspace from './SpecialMonthWorkspace'

let mockAuth = { isAdmin: true }
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

function entry(profileId, leaveType, dateFrom, dateTo, status, surname, category = 'MO') {
  return { profileId, leaveType, dateFrom, dateTo, status, surname, category }
}

const LEAVE_BY_DATE = new Map([
  ['2026-08-10', [
    entry('p1', 'maternity', '2026-08-08', '2026-08-14', 'pending', 'Ellis'),
    entry('p9', 'conference', '2026-08-10', '2026-08-10', 'approved', 'Vance', 'Consultant'),
  ]],
])

function renderWorkspace(props = {}) {
  return render(
    <SpecialMonthWorkspace
      year={2026}
      month={8}
      onMonthChange={vi.fn()}
      leaveByDate={LEAVE_BY_DATE}
      publicHolidaysByDate={new Map([['2026-08-09', "Women's Day"]])}
      rotationsByDoctorId={new Map()}
      onBack={vi.fn()}
      {...props}
    />,
    { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
  )
}

// jsdom applies no breakpoints, so the desktop grid and the mobile dot grid
// are both in the DOM. Scope day queries to the desktop one.
function desktopDay(container, dayNumber) {
  const grid = container.querySelector('.hidden.lg\\:block')
  return within(grid).getByText(String(dayNumber)).closest('button')
}

describe('SpecialMonthWorkspace', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0))
    mockAuth = { isAdmin: true }
  })

  it('renders a calendar grid with names read straight off the day cells', () => {
    const { container } = renderWorkspace()
    const day10 = desktopDay(container, 10)
    expect(within(day10).getByText('Ellis')).toBeInTheDocument()
    expect(within(day10).getByText('Vance')).toBeInTheDocument()
  })

  it('marks a public holiday on the grid', () => {
    const { container } = renderWorkspace()
    expect(within(desktopDay(container, 9)).getByText("Women's Day")).toBeInTheDocument()
  })

  // The row shape is the point of the whole exercise: it must read the same
  // as the Annual planner's day review.
  it('clicking a day opens a review panel with category, type, full period and status', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await user.click(desktopDay(container, 10))

    const panel = (await screen.findByText(/Monday, 2026-08-10/)).closest('.card')
    expect(within(panel).getByText('Ellis')).toBeInTheDocument()
    // Full request period, not just the day clicked, and the shortened type.
    expect(within(panel).getByText(/MO · Maternity · /)).toBeInTheDocument()
    expect(within(panel).getByText('Pending review')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Close'))
    expect(screen.queryByText(/Monday, 2026-08-10/)).not.toBeInTheDocument()
  })

  it('says so plainly for a day with nobody on leave', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await user.click(desktopDay(container, 12))
    const panel = (await screen.findByText(/Wednesday, 2026-08-12/)).closest('.card')
    expect(within(panel).getByText('No one is on leave today')).toBeInTheDocument()
  })

  // Consultant privacy (EC_LEAVE_PLANNER_RULES.md) — must hold on the grid
  // itself, not just in the day panel.
  it("hides a Consultant's leave from a non-admin, in the grid and the panel", async () => {
    mockAuth = { isAdmin: false }
    const user = userEvent.setup()
    const { container } = renderWorkspace()

    const day10 = desktopDay(container, 10)
    expect(within(day10).getByText('Ellis')).toBeInTheDocument()
    expect(within(day10).queryByText('Vance')).not.toBeInTheDocument()

    await user.click(day10)
    const panel = (await screen.findByText(/Monday, 2026-08-10/)).closest('.card')
    expect(within(panel).queryByText('Vance')).not.toBeInTheDocument()
  })

  it('Back returns to the overview', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    renderWorkspace({ onBack })
    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalled()
  })
})
