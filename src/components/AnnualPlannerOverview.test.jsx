import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AnnualPlannerOverview from './AnnualPlannerOverview'

let mockAuth = { isAdmin: false, isClerk: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const MAX_BY_COLUMN = { MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1 }

// August 10 has 2 MOs on leave — exactly the MO cap — so August is the one
// "Requires checking" month for an MO viewer; every other month is clear.
const COUNT_BY_COLUMN_PER_DATE = new Map([
  ['2026-08-10', new Map([['MO', 2]])],
])

function renderOverview(overrides = {}) {
  return render(
    <AnnualPlannerOverview
      year={2026}
      onYearChange={vi.fn()}
      approvedByDate={new Map()}
      pendingByDate={new Map()}
      approvedRows={[]}
      pendingRows={[]}
      countByColumnPerDate={COUNT_BY_COLUMN_PER_DATE}
      publicHolidaysByDate={new Map()}
      maxByColumnKey={MAX_BY_COLUMN}
      myProfileId="p1"
      onOpenWorkspace={vi.fn()}
      {...overrides}
    />,
    { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> }
  )
}

// jsdom doesn't apply the `lg:` breakpoint media query, so the non-admin
// mobile redesign and the existing admin/desktop dashboard are both present
// in the DOM at once (same reasoning as LeaveYearGrid.test.jsx's
// mobileDayGrid helper) — scope into the mobile block via its `lg:hidden`
// wrapper rather than relying on visibility.
function mobileBlock(container) {
  return container.querySelector('.lg\\:hidden')
}

describe('AnnualPlannerOverview — non-admin mobile category finder', () => {
  // Pinned rather than leaning on the ambient clock happening to be August
  // 2026 — the Current/Coming/Previous grouping below is relative to
  // "today", so an unpinned clock turns these red on the 1st of September.
  beforeEach(() => vi.setSystemTime(new Date(2026, 7, 6, 9, 0, 0))) // 6 Aug 2026
  afterEach(() => vi.useRealTimers())

  it('defaults the category picker to the viewer\'s own column', () => {
    const { container } = renderOverview({ myCategory: 'MO' })
    expect(within(mobileBlock(container)).getByText('MO')).toBeInTheDocument()
  })

  it('falls back to "All categories" for a viewer with no capacity column (e.g. Consultant)', () => {
    const { container } = renderOverview({ myCategory: 'Consultant' })
    expect(within(mobileBlock(container)).getByText('All categories')).toBeInTheDocument()
  })

  // Sandbox clock is 2026-08-06 for this whole session, so August is
  // "today" — the fixture's MO pressure (2 of 2 on 2026-08-10, exactly the
  // default MO cap) lands inside the current month.
  it('groups months by time — Current month first, then Coming months, then Previous months', () => {
    const { container } = renderOverview({ myCategory: 'MO' })
    const mobile = within(mobileBlock(container))

    const currentGroup = mobile.getByText('Current month').closest('div')
    expect(within(currentGroup).getByText('August')).toBeInTheDocument()

    const comingGroup = mobile.getByText('Coming months').closest('div')
    expect(within(comingGroup).getByText('September')).toBeInTheDocument()
    expect(within(comingGroup).getByText('December')).toBeInTheDocument()
    expect(within(comingGroup).queryByText('August')).not.toBeInTheDocument()

    const previousGroup = mobile.getByText('Previous months').closest('div')
    expect(within(previousGroup).getByText('January')).toBeInTheDocument()
    expect(within(previousGroup).getByText('July')).toBeInTheDocument()
    expect(within(previousGroup).queryByText('August')).not.toBeInTheDocument()
  })

  it('renames the "At capacity"/"Limited" chip to spell out how many days are affected, and drops the separate "N pressure days" line', () => {
    const { container } = renderOverview({ myCategory: 'MO' })
    const mobile = within(mobileBlock(container))

    // 2026-08-10 is the only MO-at-cap date in the fixture -> 1 red day.
    const currentGroup = mobile.getByText('Current month').closest('div')
    expect(within(currentGroup).getByText('No capacity on 1 day')).toBeInTheDocument()
    expect(within(currentGroup).queryByText('At capacity')).not.toBeInTheDocument()
    expect(mobile.queryByText(/pressure day/)).not.toBeInTheDocument()
    expect(mobile.queryByText('No pressure days')).not.toBeInTheDocument()
  })

  it('tapping a month tile opens that month\'s workspace directly', async () => {
    const user = userEvent.setup()
    const onOpenWorkspace = vi.fn()
    const { container } = renderOverview({ myCategory: 'MO', onOpenWorkspace })

    await user.click(within(mobileBlock(container)).getByText('August').closest('button'))
    expect(onOpenWorkspace).toHaveBeenCalledWith(8)
  })

  it('switching the category picker re-reads the current month\'s chip for the newly selected category', async () => {
    const user = userEvent.setup()
    // Registrar has no pressure anywhere in this fixture, unlike MO.
    const { container } = renderOverview({ myCategory: 'MO' })
    const mobile = within(mobileBlock(container))

    await user.click(mobile.getByRole('button', { name: 'Showing' }))
    // SelectMenu's option list renders through a portal onto document.body,
    // outside the scoped mobile block — query it globally instead.
    await user.click(await screen.findByRole('option', { name: 'Registrar' }))

    const currentGroup = mobile.getByText('Current month').closest('div')
    expect(within(currentGroup).getByText('August')).toBeInTheDocument()
    expect(within(currentGroup).getByText('Available')).toBeInTheDocument()
  })

  it('admin viewers do not get the category-finder mobile redesign — the full dashboard renders instead', () => {
    mockAuth = { isAdmin: true, isClerk: false }
    const { container } = renderOverview({ myCategory: 'MO' })
    expect(mobileBlock(container)).toBeNull()
    expect(screen.getByText('Selected month')).toBeInTheDocument() // the existing admin/desktop inspector
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('non-admin viewers still get the full dashboard for desktop, alongside the mobile redesign', () => {
    const { container } = renderOverview({ myCategory: 'MO' })
    expect(mobileBlock(container)).not.toBeNull()
    expect(screen.getByText('Selected month')).toBeInTheDocument()
  })

  it('toolbar carries only the Legend trigger', () => {
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    expect(screen.getByRole('button', { name: 'Legend' })).toBeInTheDocument()
  })

  it('the year stepper is the page\'s one period control, at the top of the request panel; the Selected month card has none', () => {
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    // Rendered as admin so only the one (shared) dashboard is in the DOM —
    // the non-admin mobile block would otherwise carry its own copy.
    expect(screen.queryByText('Select year')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    const prev = screen.getByRole('button', { name: 'Previous year' })
    const panel = prev.closest('div.rounded-xl')
    expect(within(panel).getByText('Annual leave · Overview')).toBeInTheDocument()
    expect(prev.parentElement).toHaveClass('btn-utility', 'w-full')
    // An admin's panel is the year alone: the category picker narrows a
    // doctor's own capacity read, which the departmental cards don't have.
    expect(screen.queryByLabelText('Showing')).not.toBeInTheDocument()
    // No month stepper anywhere: the month under the Selected month card is
    // a plain label set by the grid.
    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument()
    // The rail holds the panel, then the Selected month card, and is sticky
    // at 320px on a desktop.
    const rail = panel.parentElement
    expect(rail).toHaveClass('order-first', 'lg:sticky', 'lg:top-4', 'lg:w-80')
    expect(rail).not.toHaveClass('w-80')
    expect(rail).toContainElement(screen.getByTestId('annual-inspector'))
    expect(panel.compareDocumentPosition(screen.getByTestId('annual-inspector')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('a doctor\'s desktop dashboard carries the same panel as the finder — year, Showing, and the request action', async () => {
    mockAuth = { isAdmin: false, isClerk: false, canSubmitLeave: true }
    const user = userEvent.setup()
    renderOverview({ myCategory: 'MO' })
    const scope = document.getElementById('annual-capacity-desktop')
    expect(scope).toBeInTheDocument()
    const panel = scope.closest('div.rounded-xl')
    expect(within(panel).getByRole('button', { name: 'Previous year' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Request annual leave' })).toBeInTheDocument()
    // One id per viewport, both labelled "Showing".
    expect(screen.getAllByLabelText('Showing')).toHaveLength(2)
    // The one filled button on the page is the panel's own action (jsdom
    // holds both viewports' copies, so count within the desktop dashboard).
    const dashboard = scope.closest('.hidden.lg\\:block')
    expect(within(dashboard).getAllByRole('button').filter(b => b.className.includes('btn-primary'))).toHaveLength(1)
    await user.click(within(panel).getByRole('button', { name: 'Request annual leave' }))
    expect(await screen.findByRole('dialog', { name: 'Request annual leave' })).toBeInTheDocument()
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('clicking a month in the grid sets the Selected month card\'s label; the year stepper\'s jump sheet still reaches any year', async () => {
    const user = userEvent.setup()
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO', year: 2020 })

    const card = screen.getByTestId('annual-inspector')
    expect(within(card).getByRole('heading', { name: 'January 2020' })).toBeInTheDocument()
    await user.click(within(screen.getByTestId('annual-year-grid')).getByRole('button', { name: /^November/ }))
    expect(within(card).getByRole('heading', { name: 'November 2020' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2020, jump to year' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Jump to year' }))
    expect(sheet.getByRole('button', { name: '2016' })).toBeInTheDocument()
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('the Selected month card: stat row, the capacity bar with every level (greyed where empty), the On leave list, an outlined Open month and a My requests link', async () => {
    mockAuth = { isAdmin: false, isClerk: false, canSubmitLeave: true }
    const user = userEvent.setup()
    const onOpenWorkspace = vi.fn()
    const approvedByDate = new Map([
      ['2026-08-10', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-10', dateTo: '2026-08-11' }]],
      ['2026-08-11', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-10', dateTo: '2026-08-11' }]],
    ])
    const approvedRows = [{ id: 'r1', profile_id: 'p1', date_from: '2026-08-10', date_to: '2026-08-11', annual_leave_days: 2, status: 'approved' }]
    renderOverview({ myCategory: 'MO', approvedByDate, approvedRows, onOpenWorkspace })

    const card = within(screen.getByTestId('annual-inspector'))
    expect(card.getByText('Selected month')).toBeInTheDocument()
    expect(card.getByText('Approved', { selector: 'p' })).toBeInTheDocument()
    expect(card.getByText('2 days')).toBeInTheDocument()
    expect(card.getByText('1 request')).toBeInTheDocument()
    expect(card.getByText('Pending')).toBeInTheDocument()
    // August 2026 in the fixture's count map: 2 MOs out on the 10th (2 of 3
    // used), every other day free. Four legend entries, the empty ones greyed.
    expect(card.getByText('Leave slots · 31 days')).toBeInTheDocument()
    expect(card.getByText('0 days full')).toBeInTheDocument()
    expect(card.getByText('30 days · 0 of 3 used')).toBeInTheDocument()
    expect(card.getByText('0 days · 1 of 3').closest('li')).toHaveClass('text-ink-muted/60')
    expect(card.getByText('1 day · 2 of 3')).toBeInTheDocument()
    expect(card.getByText('0 days · full').closest('li')).toHaveClass('text-ink-muted/60')
    expect(card.getByText('On leave')).toBeInTheDocument()
    expect(card.getByText('Anderson')).toBeInTheDocument()
    expect(card.getByText('10–11 Aug')).toBeInTheDocument()

    const open = card.getByRole('button', { name: 'Open month' })
    expect(open).toHaveClass('btn-secondary')
    await user.click(open)
    expect(onOpenWorkspace).toHaveBeenCalledWith(8)
    expect(card.getByRole('link', { name: 'My requests' })).toHaveAttribute('href', '/leave?tab=requests&from=annual')
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('an admin\'s Selected month card links to Requests, not My requests', () => {
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    expect(within(screen.getByTestId('annual-inspector')).getByRole('link', { name: 'Requests' })).toBeInTheDocument()
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('the All/My leave/Pending/Capacity issues filter switch is gone entirely, for every role — the view is always "all"', () => {
    renderOverview({ myCategory: 'MO' })
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pending' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capacity issues' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()

    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pending' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capacity issues' })).not.toBeInTheDocument()
    mockAuth = { isAdmin: false, isClerk: false }
  })

  // Regression: the "Selected month" inspector's per-person list showed a
  // COSMO/Intern doctor's EC/OT label from category alone, missing
  // contract_type — an OT-hours doctor showed "EC Intern" here even though
  // the day view (which does thread contract_type) correctly showed "OT
  // Intern" for the exact same leave row.
  it('the selected-month person list labels a COSMO/Intern doctor by contract_type, not category alone', () => {
    const approvedByDate = new Map([
      ['2026-08-10', [{
        profileId: 'p9', surname: 'CodeSpace', category: 'COSMO', contractType: 'Junior_Doctor_Overtime',
        status: 'approved', dateFrom: '2026-08-10', dateTo: '2026-08-14',
      }]],
    ])
    renderOverview({ myCategory: 'MO', approvedByDate })
    expect(screen.getByText('OT Intern')).toBeInTheDocument()
    expect(screen.queryByText('EC Intern')).not.toBeInTheDocument()
  })
})
