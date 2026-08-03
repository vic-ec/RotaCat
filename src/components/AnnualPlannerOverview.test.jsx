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
})
