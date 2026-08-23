import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AnnualPlannerOverview from './AnnualPlannerOverview'

let mockAuth = { isAdmin: false, isClerk: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const MAX_BY_COLUMN = { MO: 2, Registrar: 1, EC_Intern: 2, OT_Intern: 1 }

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

    await user.click(mobile.getByRole('button', { name: 'MO' }))
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

  it('toolbar carries only the Legend trigger — the year selector lives in the inspector panel instead', () => {
    // Rendered as admin so only the one (shared) toolbar/inspector is in
    // the DOM — the non-admin mobile block duplicates the same "Previous
    // year"/"Next year" labels, which would otherwise make these queries
    // ambiguous.
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    const legendButton = screen.getByRole('button', { name: 'Legend' })
    expect(legendButton).toBeInTheDocument()

    const panel = screen.getByTestId('annual-inspector')
    expect(within(panel).queryByRole('button', { name: 'Legend' })).not.toBeInTheDocument()
    expect(legendButton.closest('div')).not.toContainElement(within(panel).getByRole('button', { name: 'Previous year' }))
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('the inspector panel opens with a Select year section above Selected month, one panel divided by a line', () => {
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })

    const panel = screen.getByTestId('annual-inspector')
    expect(within(panel).getByText('Select year')).toBeInTheDocument()
    expect(within(panel).getByText('Selected month')).toBeInTheDocument()
    const prevYear = within(panel).getByRole('button', { name: 'Previous year' })
    const nextYear = within(panel).getByRole('button', { name: 'Next year' })
    expect(prevYear).toHaveClass('h-[30px]', 'w-[30px]')
    expect(nextYear).toHaveClass('h-[30px]', 'w-[30px]')
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('the Selected month panel has its own chevrons for stepping through months without touching the year selector above', async () => {
    const user = userEvent.setup()
    mockAuth = { isAdmin: true, isClerk: false }
    // year 2020 (not "today"'s real year) so selectedMonth deterministically
    // starts at January, regardless of whatever month this suite runs in.
    renderOverview({ myCategory: 'MO', year: 2020 })

    const panel = screen.getByTestId('annual-inspector')
    expect(within(panel).getByText('January 2020')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Next month' }))
    expect(within(panel).getByText('February 2020')).toBeInTheDocument()

    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('stepping the Selected month panel past a year boundary rolls the year via onYearChange', async () => {
    const user = userEvent.setup()
    mockAuth = { isAdmin: true, isClerk: false }
    const onYearChange = vi.fn()
    renderOverview({ myCategory: 'MO', year: 2020, onYearChange })

    const panel = screen.getByTestId('annual-inspector')
    await user.click(within(panel).getByRole('button', { name: 'Previous month' }))
    expect(onYearChange).toHaveBeenCalledWith(2019)

    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('the Selected month panel label opens a jump-to-month sheet, same as the shared DateStepper elsewhere', async () => {
    const user = userEvent.setup()
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO', year: 2020 })

    const panel = screen.getByTestId('annual-inspector')
    await user.click(within(panel).getByRole('button', { name: 'January 2020' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Jump to month' }))
    await user.click(sheet.getByRole('button', { name: 'November' }))
    expect(within(panel).getByText('November 2020')).toBeInTheDocument()

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
