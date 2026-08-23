import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AnnualLeavePlanner from './AnnualLeavePlanner'

// Sandbox clock is 2026-08-01 throughout this session, so August is the
// default-selected month and the default-viewed year is 2026.
let mockAuth = { profile: { id: 'p1' }, isAdmin: true }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// Fixture tuned so August reproduces the reference mockup's own example
// text ("… pressure days · 1 pending"):
//  - p1 (Anderson, MO) approved 11–15 Aug (5 days) — no MO pressure since
//    the default MO cap is 2 and there's only one MO doctor off.
//  - p2 (Botha, Registrar) approved 12–13 Aug (2 days) — the default
//    Registrar cap is 1, so both those days are immediately "at cap".
//  - p3 (Cosmo, EC COSMO/Intern via the 'COSMO' category) has one pending
//    request on 20 Aug — pending counts toward the cap too (the real
//    concurrency rule checks pending+approved together, see
//    checkAnnualLeaveCapacity in leaveRequests.js), but the default EC
//    COSMO/Intern cap is 2, so that single pending request alone doesn't
//    reach it. Total: 2 pressure days (12, 13).
// January has nothing at all, for the "Quiet" empty state.
const LEAVE_REQUESTS = [
  {
    id: 'req-1', profile_id: 'p1', date_from: '2026-08-11', date_to: '2026-08-15', leave_type: 'annual',
    status: 'approved', annual_leave_days: 5, profiles: { name: 'Alice', surname: 'Anderson', category: 'MO' },
  },
  {
    id: 'req-2', profile_id: 'p2', date_from: '2026-08-12', date_to: '2026-08-13', leave_type: 'annual',
    status: 'approved', annual_leave_days: 2, profiles: { name: 'Bob', surname: 'Botha', category: 'Registrar' },
  },
  {
    id: 'req-3', profile_id: 'p3', date_from: '2026-08-20', date_to: '2026-08-20', leave_type: 'annual',
    status: 'pending', annual_leave_days: 1, profiles: { name: 'Carol', surname: 'Cosmo', category: 'COSMO' },
  },
]

const { mockResponses } = vi.hoisted(() => ({ mockResponses: {} }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        eq() { return builder },
        in() { return builder },
        gte() { return builder },
        lte() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

// Reports the live query string, so the deep-link tests can assert what
// AnnualLeavePlanner actually left in the URL rather than only what it
// rendered.
function LocationProbe() {
  const { search } = useLocation()
  return <span data-testid="location-probe">{search}</span>
}

function renderPage(initialEntries = ['/'], props = {}) {
  return render(
    <>
      <LocationProbe />
      <AnnualLeavePlanner {...props} />
    </>,
    { wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter> }
  )
}

// Scopes month-card queries to the grid, excluding the inspector's own
// DateStepper (its label is also "<Month> <year>", and a card's own
// accessible name isn't just the bare month either — its summary line
// ("2 pressure days · 1 pending", "Quiet", …) is part of it too). Async
// (findByTestId, not getByTestId) so it doubles as the "wait for the async
// fetch to resolve and the grid to mount" step every test already needed.
async function grid() {
  return within(await screen.findByTestId('annual-year-grid'))
}

describe('AnnualLeavePlanner', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:select'] = { data: LEAVE_REQUESTS, error: null }
    mockResponses['public_holidays:select'] = { data: [], error: null }
    mockResponses['constraints:select'] = { data: [], error: null } // falls back to defaults: MO 2, Registrar 1, EC_Intern 2, OT_Intern 1, EC full-time 2
    mockResponses['profiles:select'] = { data: null, count: 20, error: null }
    mockAuth = { profile: { id: 'p1' }, isAdmin: true }
  })

  it('renders all 12 months and defaults the selection to the current month (August)', async () => {
    renderPage()
    const g = await grid()
    expect(g.getByRole('button', { name: /^January/ })).toBeInTheDocument()
    expect(g.getByRole('button', { name: /^December/ })).toBeInTheDocument()

    const augustCard = g.getByRole('button', { name: /^August/ })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')
    expect(g.getByRole('button', { name: /^January/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the pressure/pending summary line on the affected month card', async () => {
    renderPage()
    const g = await grid()
    const augustCard = g.getByRole('button', { name: /^August/ })
    expect(within(augustCard).getByText('2 pressure days · 1 pending')).toBeInTheDocument()

    const januaryCard = g.getByRole('button', { name: /^January/ })
    expect(within(januaryCard).getByText('Quiet')).toBeInTheDocument()
  })

  it('inspector defaults to August, showing "Leave during" the pressure date range and who is on it', async () => {
    renderPage()
    await grid()

    expect(screen.getByText('Selected month')).toBeInTheDocument()
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('Leave during 12–13 Aug')).toBeInTheDocument() // the Registrar at-cap range
    expect(screen.getByText('2 people · 2 approved · 0 pending')).toBeInTheDocument()
    expect(screen.getByText('Anderson')).toBeInTheDocument() // also on leave those days
    expect(screen.getByText('Botha')).toBeInTheDocument()
  })

  it('shows a combined "X of 3 slots taken" capacity breakdown in "Leave Slot Utilization", not a per-category one', async () => {
    renderPage()
    await grid()
    const inspector = within(screen.getByTestId('annual-inspector'))
    expect(inspector.getByText('Leave Slot Utilization')).toBeInTheDocument()

    // 11, 14, 15 Aug: Anderson (MO) alone — 1 of 3. 20 Aug: Cosmo's pending
    // EC COSMO/Intern request alone — also 1 of 3. Four days total.
    expect(within(inspector.getByText('1 of 3').closest('div')).getByText('4 days')).toBeInTheDocument()
    // 12-13 Aug: Anderson (MO) + Botha (Registrar) together — 2 of 3.
    expect(within(inspector.getByText('2 of 3').closest('div')).getByText('2 days')).toBeInTheDocument()
    // Nothing ever reaches 3 of 3 in this fixture.
    expect(within(inspector.getByText('3 of 3').closest('div')).getByText('0 days')).toBeInTheDocument()
  })

  it('tapping a name in the date-range list reveals their full leave dates', async () => {
    const user = userEvent.setup()
    renderPage()
    await grid()

    expect(screen.queryByText(/Full leave:/)).not.toBeInTheDocument()
    await user.click(screen.getByText('Anderson'))
    expect(screen.getByText('Full leave: 11–15 Aug')).toBeInTheDocument()

    await user.click(screen.getByText('Anderson'))
    expect(screen.queryByText(/Full leave:/)).not.toBeInTheDocument()
  })

  it('shows a right-aligned Approved/Pending status pill for each name in the "Leave during" list', async () => {
    renderPage()
    await grid()
    // Anderson + Botha, both approved on 12-13 Aug.
    expect(screen.getAllByText('Approved')).toHaveLength(2)
  })

  it('shows a public holiday count in the inspector, and its name on hover in the year grid', async () => {
    mockResponses['public_holidays:select'] = { data: [{ date: '2026-08-10', name: "Women's Day" }], error: null }
    renderPage()
    await grid()

    expect(within(screen.getByTestId('annual-inspector')).getByText('1 days')).toBeInTheDocument()
    expect(screen.getByTitle("Women's Day")).toBeInTheDocument()
  })

  it('no longer shows a surname search input or a Year/Month toggle in the toolbar', async () => {
    renderPage()
    await grid()
    expect(screen.queryByLabelText('Search by surname')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Year' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
  })

  it('clicking a quiet month updates the inspector accordingly', async () => {
    const user = userEvent.setup()
    renderPage()
    const g = await grid()

    await user.click(g.getByRole('button', { name: /^January/ }))
    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('No capacity pressure this month.')).toBeInTheDocument()
  })

  it('"View requests" links to the Requests planner tab', async () => {
    renderPage()
    await grid()
    expect(screen.getByRole('link', { name: /View requests/ })).toHaveAttribute('href', '/leave?tab=requests')
  })

  it('"Open month workspace" switches to the month calendar (for the selected month), and Back returns to the overview', async () => {
    const user = userEvent.setup()
    renderPage()
    await grid()

    await user.click(screen.getByRole('button', { name: /Open month workspace/ }))
    expect(screen.getByRole('button', { name: '← Overview' })).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument() // full weekday name column header
    expect(screen.getAllByText('August 2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('Selected month')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Overview' }))
    expect(await screen.findByText('Selected month')).toBeInTheDocument()
  })

  it('restores the month workspace straight from the URL — surviving a background-triggered reload without a deep link', async () => {
    // No deepLinkMonth prop involved here — this is the ongoing ayear/aview/
    // amonth persistence, seeded purely by the URL a remount reads on mount
    // (see AnnualLeavePlanner.jsx's header comment for why plain useState
    // can't survive an OS-killed-and-reloaded PWA).
    renderPage(['/?ayear=2026&aview=workspace&amonth=8'])
    expect(await screen.findByRole('button', { name: '← Overview' })).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getAllByText('August 2026').length).toBeGreaterThan(0)
  })

  // The Requests queue's "View Calendar" deep link, exercised the way it
  // actually arrives: `?month=&highlight=` on the URL, with the parent
  // (LeavePlannerPage) stripping those two params once consumed. The seed
  // write and the strip used to be two separate setSearchParams calls, and
  // the second computed its `next` from a stale `prev` — so it silently
  // wiped the ayear/aview/amonth the first had just written, dropping the
  // admin on the *current* month's overview instead of the request's month.
  it('a deep link opens the workspace on the request\'s own month, not the current one', async () => {
    renderPage(['/?month=2026-10&highlight=2026-10-03'], { deepLinkMonth: '2026-10', deepLinkHighlightDate: '2026-10-03' })
    expect(await screen.findByRole('button', { name: '← Overview' })).toBeInTheDocument()
    expect(screen.getAllByText('October 2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('August 2026')).not.toBeInTheDocument()
  })

  it('a deep link leaves the URL holding the request\'s month, with the one-shot params stripped', async () => {
    renderPage(['/?month=2026-10&highlight=2026-10-03'], { deepLinkMonth: '2026-10', deepLinkHighlightDate: '2026-10-03' })
    await screen.findByRole('button', { name: '← Overview' })
    const search = screen.getByTestId('location-probe').textContent
    expect(search).toContain('aview=workspace')
    expect(search).toContain('amonth=10')
    expect(search).toContain('ayear=2026')
    expect(search).not.toContain('month=2026-10')   // the one-shot deep link is consumed
    expect(search).not.toContain('highlight=')
  })

  it('the Legend sheet\'s "How it works" footer shows the concurrency-cap detail, closable via the × button', async () => {
    const user = userEvent.setup()
    renderPage()
    await grid()

    expect(screen.queryByText(/Never more than 3 doctors on leave at a time/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Legend' }))
    expect(screen.getByText(/Never more than 3 doctors on leave at a time/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/Never more than 3 doctors on leave at a time/)).not.toBeInTheDocument()
  })
})
