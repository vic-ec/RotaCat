import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SpecialPlannerOverview from './SpecialPlannerOverview'

let mockAuth = { isAdmin: true }
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

function entry(profileId, leaveType, dateFrom, dateTo, status = 'approved', surname = profileId) {
  return { profileId, leaveType, dateFrom, dateTo, status, surname, category: 'MO' }
}

const LEAVE_BY_DATE = new Map([
  ['2026-08-10', [
    entry('p1', 'study', '2026-08-10', '2026-08-11', 'approved', 'Ellis'),
    entry('p2', 'maternity', '2026-08-10', '2026-08-10', 'pending', 'Stone'),
  ]],
  ['2026-08-11', [entry('p1', 'study', '2026-08-10', '2026-08-11', 'approved', 'Ellis')]],
])

function renderOverview(props = {}) {
  return render(
    <SpecialPlannerOverview
      year={2026}
      onYearChange={vi.fn()}
      leaveByDate={LEAVE_BY_DATE}
      publicHolidaysByDate={new Map()}
      onOpenWorkspace={vi.fn()}
      {...props}
    />,
    { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
  )
}

function inspector() {
  return within(screen.getByTestId('special-inspector'))
}

function grid() {
  return within(screen.getByTestId('special-year-grid'))
}

describe('SpecialPlannerOverview', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)) // 1 Aug 2026
    mockAuth = { isAdmin: true }
  })

  // The whole point of this view: the Special tab should read like the
  // Annual tab, which means a 12-month grid plus a selected-month rail.
  it('renders a card per month and defaults the selection to the current month', () => {
    renderOverview()
    expect(grid().getAllByRole('button')).toHaveLength(12)
    expect(grid().getByRole('button', { name: /^August/ })).toHaveAttribute('aria-pressed', 'true')
    expect(inspector().getByText('August 2026')).toBeInTheDocument()
  })

  it("lists the selected month's leave with type, period and status", () => {
    renderOverview()
    // Scoped to the entries list: "Approved" is also a stat label in the
    // rail above it, so an unscoped query is genuinely ambiguous here.
    const entries = within(screen.getByTestId('special-month-entries'))
    expect(entries.getByText('Ellis')).toBeInTheDocument()
    // Shortened: "Maternity", not "Maternity leave".
    expect(entries.getByText(/^Maternity · /)).toBeInTheDocument()
    expect(entries.getByText('Pending review')).toBeInTheDocument()
    expect(entries.getByText('Approved')).toBeInTheDocument()
  })

  it('counts a multi-day request once in the approved/pending tallies', () => {
    renderOverview()
    // Ellis spans 10-11 Aug but is one request, so approved reads 1 not 2.
    expect(inspector().getByText(/2 people · 1 approved · 1 pending/)).toBeInTheDocument()
  })

  it('a second click on the already-selected month opens it, the first click just selects', async () => {
    const user = userEvent.setup()
    const onOpenWorkspace = vi.fn()
    renderOverview({ onOpenWorkspace })

    await user.click(grid().getByRole('button', { name: /^March/ }))
    expect(onOpenWorkspace).not.toHaveBeenCalled()
    expect(inspector().getByText('March 2026')).toBeInTheDocument()

    await user.click(grid().getByRole('button', { name: /^March/ }))
    expect(onOpenWorkspace).toHaveBeenCalledWith(3)
  })

  it('Open month opens the month currently selected in the rail', async () => {
    const user = userEvent.setup()
    const onOpenWorkspace = vi.fn()
    renderOverview({ onOpenWorkspace })
    await user.click(inspector().getByRole('button', { name: /Open month/ }))
    expect(onOpenWorkspace).toHaveBeenCalledWith(8)
  })

  it('says so plainly for a month with nothing in it', async () => {
    const user = userEvent.setup()
    renderOverview()
    await user.click(grid().getByRole('button', { name: /^January/ }))
    expect(inspector().getByText('No leave this month.')).toBeInTheDocument()
  })

  // Reported, never enforced — see SPECIAL_LEAVE_SOFT_CAP.
  it('reports days above the 3-doctor guideline, and stays quiet when there are none', async () => {
    const user = userEvent.setup()
    const pressured = new Map([['2026-08-10', [
      entry('p1', 'study', '2026-08-10', '2026-08-10'),
      entry('p2', 'workshop', '2026-08-10', '2026-08-10'),
      entry('p3', 'conference', '2026-08-10', '2026-08-10'),
    ]]])
    renderOverview({ leaveByDate: pressured })
    expect(inspector().getByText('Above guideline')).toBeInTheDocument()
    expect(inspector().getByText(/3\+ doctors on special leave at once/)).toBeInTheDocument()

    await user.click(grid().getByRole('button', { name: /^January/ }))
    expect(inspector().queryByText('Above guideline')).not.toBeInTheDocument()
  })

  // ── Non-admin mobile month finder (mirrors the Annual tab's) ──────────
  describe('non-admin mobile month finder', () => {
    beforeEach(() => { mockAuth = { isAdmin: false } })

    function tiles() {
      return within(screen.getByTestId('special-month-finder'))
    }

    it('groups months as Current, then Coming, then Previous', () => {
      renderOverview()
      const finder = tiles()
      expect(within(finder.getByText('Current month').closest('div')).getByText('August')).toBeInTheDocument()

      const coming = finder.getByText('Coming months').closest('div')
      expect(within(coming).getByText('September')).toBeInTheDocument()
      expect(within(coming).getByText('December')).toBeInTheDocument()
      expect(within(coming).queryByText('August')).not.toBeInTheDocument()

      const previous = finder.getByText('Previous months').closest('div')
      expect(within(previous).getByText('January')).toBeInTheDocument()
      expect(within(previous).getByText('July')).toBeInTheDocument()
    })

    it('opens a month straight from its tile', async () => {
      const user = userEvent.setup()
      const onOpenWorkspace = vi.fn()
      renderOverview({ onOpenWorkspace })
      await user.click(within(tiles().getByText('Current month').closest('div')).getByRole('button'))
      expect(onOpenWorkspace).toHaveBeenCalledWith(8)
    })

    // The picker narrows WHO is counted. It deliberately does not touch the
    // capacity colours: special leave's guideline is 3 doctors of any
    // category, so a per-category colour would claim capacity that doesn't
    // exist.
    it('filters the people count by category, leaving the shared capacity chip alone', async () => {
      const user = userEvent.setup()
      const mixed = new Map([['2026-08-10', [
        { ...entry('p1', 'study', '2026-08-10', '2026-08-10'), category: 'MO' },
        { ...entry('p2', 'workshop', '2026-08-10', '2026-08-10'), category: 'Registrar' },
        { ...entry('p3', 'conference', '2026-08-10', '2026-08-10'), category: 'Registrar' },
      ]]])
      renderOverview({ leaveByDate: mixed, myCategory: 'MO' })

      const august = () => within(tiles().getByText('Current month').closest('div'))
      // Defaults to the viewer's own group — one MO of the three people out.
      expect(august().getByText('1 on leave')).toBeInTheDocument()
      // The chip reads the true shared count (all 3), not the filtered one.
      expect(august().getByText('No capacity on 1 day')).toBeInTheDocument()

      // The picker's trigger is named by its current value (SelectMenu).
      await user.click(tiles().getByRole('button', { name: 'MO' }))
      await user.click(await screen.findByRole('option', { name: 'Registrar' }))
      expect(august().getByText('2 on leave')).toBeInTheDocument()
      expect(august().getByText('No capacity on 1 day')).toBeInTheDocument()
    })

    // The chip names the same states the Annual tab's month tiles do, plus
    // one Annual can't reach: special leave has no enforced cap, so a day
    // can go past the 3-doctor guideline entirely.
    it('names capacity states the way the Annual planner does, including going over the guideline', () => {
      const august = () => within(tiles().getByText('Current month').closest('div'))
      const dayWith = ids => new Map([['2026-08-10', ids.map(id => entry(id, 'study', '2026-08-10', '2026-08-10'))]])

      const empty = renderOverview({ leaveByDate: new Map() })
      expect(august().getByText('Available')).toBeInTheDocument()
      empty.unmount()

      const one = renderOverview({ leaveByDate: dayWith(['p1']) })
      expect(august().getByText('Limited capacity on 1 day')).toBeInTheDocument()
      one.unmount()

      const three = renderOverview({ leaveByDate: dayWith(['p1', 'p2', 'p3']) })
      expect(august().getByText('No capacity on 1 day')).toBeInTheDocument()
      three.unmount()

      // A fourth doctor on the same day: past the guideline, not merely at it.
      renderOverview({ leaveByDate: dayWith(['p1', 'p2', 'p3', 'p4']) })
      expect(august().getByText('Capacity exceeded on 1 day')).toBeInTheDocument()
    })
  })
})
