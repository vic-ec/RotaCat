import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AnnualPlannerOverview from './AnnualPlannerOverview'

let mockAuth = { isAdmin: false, isClerk: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const MAX_BY_COLUMN = { MO: 2, Registrar: 1, EC_COSMO: 2, OT_COSMO: 1 }

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

  it('groups months into "Best months" and "Requires checking" by the selected category\'s own cap', () => {
    const { container } = renderOverview({ myCategory: 'MO' })
    const mobile = within(mobileBlock(container))

    const bestGroup = mobile.getByText('Best months').closest('div')
    expect(within(bestGroup).getByText('January')).toBeInTheDocument()

    const checkingGroup = mobile.getByText('Requires checking').closest('div')
    expect(within(checkingGroup).getByText('August')).toBeInTheDocument()
    expect(within(checkingGroup).getByText('1 pressure day')).toBeInTheDocument()
    expect(within(checkingGroup).getByText('At capacity')).toBeInTheDocument()

    // August must not also appear in Best months.
    expect(within(bestGroup).queryByText('August')).not.toBeInTheDocument()
  })

  it('tapping a month tile opens that month\'s workspace directly', async () => {
    const user = userEvent.setup()
    const onOpenWorkspace = vi.fn()
    const { container } = renderOverview({ myCategory: 'MO', onOpenWorkspace })

    await user.click(within(mobileBlock(container)).getByText('August').closest('button'))
    expect(onOpenWorkspace).toHaveBeenCalledWith(8)
  })

  it('switching the category picker re-groups the months for the newly selected category', async () => {
    const user = userEvent.setup()
    // Registrar has no pressure anywhere in this fixture, so switching to it
    // should move August into "Best months" too.
    const { container } = renderOverview({ myCategory: 'MO' })
    const mobile = within(mobileBlock(container))

    await user.click(mobile.getByRole('button', { name: 'MO' }))
    // SelectMenu's option list renders through a portal onto document.body,
    // outside the scoped mobile block — query it globally instead.
    await user.click(await screen.findByRole('option', { name: 'Registrar' }))

    const bestGroup = mobile.getByText('Best months').closest('div')
    expect(within(bestGroup).getByText('August')).toBeInTheDocument()
    expect(mobile.queryByText('Requires checking')).not.toBeInTheDocument()
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

  it('toolbar: the year selector sits with the other nav controls on the right (before the help icon), not attached to the title, and the arrow buttons are 30x30', () => {
    // Rendered as admin so only the one (shared) toolbar is in the DOM —
    // the non-admin mobile block duplicates the same "Previous year"/"Next
    // year" labels, which would otherwise make these queries ambiguous.
    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    const prevYear = screen.getByRole('button', { name: 'Previous year' })
    const nextYear = screen.getByRole('button', { name: 'Next year' })
    expect(prevYear).toHaveClass('h-[30px]', 'w-[30px]')
    expect(nextYear).toHaveClass('h-[30px]', 'w-[30px]')

    // Same right-hand group as the help trigger, in this order — mirrors
    // the month view's toolbar, where the date selector and its neighbours
    // are one cluster on the right rather than paired with the title.
    const group = prevYear.closest('div')
    const helpButton = screen.getByRole('button', { name: 'How it works' })
    expect(group).toContainElement(helpButton)
    const buttons = [...group.querySelectorAll('button')]
    expect(buttons.indexOf(nextYear)).toBeLessThan(buttons.indexOf(helpButton))
    mockAuth = { isAdmin: false, isClerk: false }
  })

  it('the All/My leave/Pending filter switch is admin-only — a non-admin doctor already sees their own leave on My Leave, and always lands on "All" anyway', () => {
    renderOverview({ myCategory: 'MO' })
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pending' })).not.toBeInTheDocument()

    mockAuth = { isAdmin: true, isClerk: false }
    renderOverview({ myCategory: 'MO' })
    expect(screen.getByRole('button', { name: 'My leave' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pending' })).toBeInTheDocument()
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
