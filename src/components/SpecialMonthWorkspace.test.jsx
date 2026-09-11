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

// Mobile dot grid counterpart of desktopDay — the phone cells carry the
// category badges, the desktop ones carry surnames.
function mobileDay(container, dayNumber) {
  const grid = within(container).getByTestId('special-mobile-grid')
  return within(grid).getByText(String(dayNumber)).closest('button')
}

describe('SpecialMonthWorkspace', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0))
    mockAuth = { isAdmin: true, canSubmitLeave: true }
  })

  it('renders a calendar grid with names and category badges read straight off the day cells', () => {
    const { container } = renderWorkspace()
    const day10 = desktopDay(container, 10)
    expect(within(day10).getByText('Ellis')).toBeInTheDocument()
    expect(within(day10).getByText('Vance')).toBeInTheDocument()
    // Ellis is an MO, Vance a Consultant — each name carries its own badge.
    expect(within(day10).getByText('MO')).toBeInTheDocument()
    expect(within(day10).getByText('C')).toBeInTheDocument()
  })

  // The capacity colour rides on the date number, not the whole cell: a month
  // of full-bleed fills reads as a wall of colour and forces every name in the
  // cell to be legible against four different backgrounds. Same four states,
  // same colours, same read as the Annual planner's grid.
  it('marks each day with its own capacity state on the date number', () => {
    const { container } = renderWorkspace()
    // Two doctors out on the 10th of three guideline slots — near capacity.
    expect(within(desktopDay(container, 10)).getByText('10').className).toMatch(/\bbg-capNear\b/)
    // Nobody out on the 12th: available is a state, not the absence of one.
    expect(within(desktopDay(container, 12)).getByText('12').className).toMatch(/\bbg-capAvailable\b/)
    expect(within(mobileDay(container, 10)).getByText('10').className).toMatch(/\bbg-capNear\b/)
  })

  // The Special tab had no request path short of finding a tappable day.
  it('offers a request panel on both viewports, reporting the month against the guideline', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    // Nothing in the fixture reaches 3 doctors on one day.
    expect(screen.getAllByText(/days are at the 3-doctor guideline/)).toHaveLength(2)
    expect(screen.getAllByText('Special leave · August')).toHaveLength(2)

    // Straight into the request form for a sensible date, no day-hunting.
    await user.click(screen.getAllByRole('button', { name: 'Request special leave' })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Special leave' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('hides the panel action from a viewer who cannot submit leave', () => {
    mockAuth = { isAdmin: true, canSubmitLeave: false }
    renderWorkspace()
    expect(screen.getAllByText(/guideline/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Request special leave' })).not.toBeInTheDocument()
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

    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(/Monday, 2026-08-10/)).toBeInTheDocument()
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
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(/Wednesday, 2026-08-12/)).toBeInTheDocument()
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
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByText('Vance')).not.toBeInTheDocument()
  })

  // The guideline banner that used to sit above the grid is deliberately
  // gone: the day panel already states the slots for the day being asked
  // about, and a permanent month-wide restatement of a rule nothing
  // enforces was noise above every grid.
  it('has no capacity banner above the grid', () => {
    renderWorkspace({ myCategory: 'MO' })
    expect(screen.queryByText(/shared guideline/)).not.toBeInTheDocument()
    expect(screen.queryByText(/counted under/)).not.toBeInTheDocument()
  })

  it('shows category badges on the mobile day cells', () => {
    const { container } = renderWorkspace()
    const day10 = mobileDay(container, 10)
    expect(within(day10).getByText('MO')).toBeInTheDocument()
    expect(within(day10).getByText('C')).toBeInTheDocument()
  })

  it('counts the day panel\'s slots against the shared soft cap', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await user.click(desktopDay(container, 10))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('2 of 3 slots taken')).toBeInTheDocument()
    expect(panel).toHaveTextContent('1 slot available (guideline, any category)')
  })

  // The count is the true shared one — a non-admin can't see WHO the
  // Consultant is, but the slot they occupy still has to be counted, or the
  // guideline would read as looser than it is.
  it('still counts hidden Consultant leave in a non-admin\'s slot line', async () => {
    mockAuth = { isAdmin: false, canSubmitLeave: true }
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await user.click(desktopDay(container, 10))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('2 of 3 slots taken')).toBeInTheDocument()
    expect(within(panel).queryByText('Vance')).not.toBeInTheDocument()
  })

  it('opens the request form for the clicked day, and hides it from viewers who cannot submit', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await user.click(desktopDay(container, 12))
    await user.click(await screen.findByRole('button', { name: 'Request leave for this day' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeInTheDocument()
    // Opened from the Special tab, so the type leads with Special leave —
    // the SelectMenu trigger is named by its current value.
    expect(within(dialog).getByRole('button', { name: 'Special leave' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Request leave for this day' })).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Close'))
    mockAuth = { isAdmin: true, canSubmitLeave: false }
    const second = renderWorkspace()
    await user.click(desktopDay(second.container, 12))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Request leave for this day' })).not.toBeInTheDocument()
  })

  it('Overview returns to the year view', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    renderWorkspace({ onBack })
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(onBack).toHaveBeenCalled()
  })
})
